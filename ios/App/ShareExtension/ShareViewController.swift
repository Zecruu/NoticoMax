//
// ShareViewController.swift
//
// Receives content from iOS Share Sheet (text, URL, or note), encodes it
// into a noticomax://share?title=&text=&url= URL, opens that URL — Notico
// Max's main app picks it up via Capacitor's appUrlOpen listener and
// routes to /share-target where the user can confirm + save.
//

import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers

class ShareViewController: SLComposeServiceViewController {

  override func isContentValid() -> Bool {
    return true
  }

  override func didSelectPost() {
    let extensionItem = (extensionContext?.inputItems.first as? NSExtensionItem)
    let providers = extensionItem?.attachments ?? []

    let userTitle = (contentText ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    var collectedURL: String? = nil
    var collectedText: String? = nil

    let group = DispatchGroup()
    for provider in providers {
      if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
        group.enter()
        provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, _ in
          if let url = item as? URL { collectedURL = url.absoluteString }
          else if let s = item as? String, !s.isEmpty { collectedURL = s }
          group.leave()
        }
      } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
        group.enter()
        provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { item, _ in
          if let s = item as? String { collectedText = s }
          group.leave()
        }
      } else if provider.hasItemConformingToTypeIdentifier(UTType.text.identifier) {
        group.enter()
        provider.loadItem(forTypeIdentifier: UTType.text.identifier, options: nil) { item, _ in
          if let s = item as? String { collectedText = s }
          group.leave()
        }
      }
    }

    group.notify(queue: .main) { [weak self] in
      guard let self = self else { return }
      var components = URLComponents(string: "noticomax://share")!
      var queryItems: [URLQueryItem] = []
      if !userTitle.isEmpty { queryItems.append(URLQueryItem(name: "title", value: userTitle)) }
      if let t = collectedText, !t.isEmpty { queryItems.append(URLQueryItem(name: "text", value: t)) }
      if let u = collectedURL, !u.isEmpty { queryItems.append(URLQueryItem(name: "url", value: u)) }
      components.queryItems = queryItems

      // Share extensions on iOS 14+ are SUPPOSED to be able to use
      // extensionContext.open — but Apple's behavior is inconsistent for
      // custom URL schemes. Try that first, and if it returns success=false
      // fall back to the legacy responder-chain selector trick (which still
      // resolves on iOS 16/17 in practice when the extension is hosted in
      // a process that has UIApplication ancestry).
      if let url = components.url {
        self.extensionContext?.open(url, completionHandler: { [weak self] success in
          if !success {
            _ = self?.openURLViaResponderChain(url)
          }
          self?.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        })
      } else {
        self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
      }
    }
  }

  override func configurationItems() -> [Any]! {
    return []
  }

  /// Walk the responder chain looking for a UIResponder that answers the
  /// legacy `openURL:` selector (on iOS this is UIApplication-ish). Apple
  /// has been deprecating this for years but it still works on current iOS.
  private func openURLViaResponderChain(_ url: URL) -> Bool {
    let selector = sel_registerName("openURL:")
    var responder: UIResponder? = self
    while let r = responder {
      // Skip self — our own openURLViaResponderChain doesn't carry that
      // selector, but be defensive in case a future name collision arises.
      if r !== self && r.responds(to: selector) {
        _ = r.perform(selector, with: url)
        return true
      }
      responder = r.next
    }
    return false
  }
}
