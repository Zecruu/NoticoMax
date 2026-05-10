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

      // Share extensions use NSExtensionContext.open to bounce a URL back
      // into a host app. UIApplication.shared isn't accessible from inside
      // app extensions, and the responder-chain `openURL:` trick stopped
      // working when Apple removed the legacy selector. This is the
      // documented API and works on iOS 14+.
      if let url = components.url {
        self.extensionContext?.open(url, completionHandler: { _ in
          self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        })
      } else {
        self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
      }
    }
  }

  override func configurationItems() -> [Any]! {
    return []
  }
}
