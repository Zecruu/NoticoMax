import UIKit
import MapKit
import Capacitor

/// Persistent place pins only. Never enables user-location or background tracking.
@objc(FamilyMapPlugin)
public class FamilyMapPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FamilyMapPlugin"
    public let jsName = "FamilyMap"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "close", returnType: CAPPluginReturnPromise)
    ]
    private weak var activeMap: FamilyMapViewController?

    @objc func open(_ call: CAPPluginCall) {
        let rawPins = call.getArray("pins", JSObject.self) ?? []
        guard rawPins.count <= 500 else { call.reject("Too many pins for one map view."); return }
        var pins: [FamilyMapPin] = []
        for raw in rawPins {
            guard let latitude = raw["latitude"] as? Double, let longitude = raw["longitude"] as? Double,
                  latitude.isFinite, longitude.isFinite, (-90...90).contains(latitude), (-180...180).contains(longitude),
                  let title = raw["title"] as? String, !title.isEmpty else { call.reject("Invalid map pin."); return }
            let pin = FamilyMapPin()
            pin.coordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
            pin.title = String(title.prefix(120))
            pin.address = String((raw["address"] as? String ?? "").prefix(500))
            pin.subtitle = pin.address
            pins.append(pin)
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let presenter = self.bridge?.viewController else { call.reject("Map is unavailable."); return }
            guard self.activeMap == nil, presenter.presentedViewController == nil else { call.reject("Close the current view before opening Maps."); return }
            let map = FamilyMapViewController(pins: pins, allowsPicking: call.getBool("pick", false), mapTitle: call.getString("title") ?? "Family places") { [weak self] result in
                self?.activeMap = nil
                call.resolve(result)
            }
            self.activeMap = map
            let navigation = UINavigationController(rootViewController: map)
            navigation.modalPresentationStyle = .fullScreen
            presenter.present(navigation, animated: true)
        }
    }

    @objc func close(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.activeMap?.cancel()
            call.resolve()
        }
    }
}

private final class FamilyMapPin: MKPointAnnotation { var address = "" }

private final class FamilyMapViewController: UIViewController, MKMapViewDelegate, UISearchBarDelegate {
    private let map = MKMapView()
    private let searchBar = UISearchBar()
    private let detail = UILabel()
    private let pins: [FamilyMapPin]
    private let allowsPicking: Bool
    private let completion: (JSObject) -> Void
    private var selected: FamilyMapPin?
    private var search: MKLocalSearch?
    private var searchGeneration = 0
    private var finished = false
    private lazy var saveButton = UIBarButtonItem(title: "Use this place", style: .done, target: self, action: #selector(usePlace))

    init(pins: [FamilyMapPin], allowsPicking: Bool, mapTitle: String, completion: @escaping (JSObject) -> Void) {
        self.pins = pins
        self.allowsPicking = allowsPicking
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
        title = mapTitle
    }
    required init?(coder: NSCoder) { fatalError("Not available in Interface Builder") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: "Done", style: .plain, target: self, action: #selector(cancel))
        if allowsPicking { navigationItem.rightBarButtonItem = saveButton; saveButton.isEnabled = false }
        map.delegate = self
        map.showsUserLocation = false
        map.accessibilityLabel = allowsPicking ? "Choose a persistent place. Search or press and hold the map." : "Saved places, not member locations"
        searchBar.delegate = self
        searchBar.placeholder = "Search a place or address"
        searchBar.isHidden = !allowsPicking
        detail.numberOfLines = 0
        detail.font = .preferredFont(forTextStyle: .subheadline)
        detail.textColor = .secondaryLabel
        detail.text = allowsPicking ? "Search or press and hold to choose a place. Nothing is saved until you confirm back in the app." : "Saved places are destinations, not live member locations."
        let stack = UIStackView(arrangedSubviews: [searchBar, map, detail])
        stack.axis = .vertical
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 12),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -12),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12),
            detail.heightAnchor.constraint(greaterThanOrEqualToConstant: 48)
        ])
        map.addAnnotations(pins)
        if pins.count == 1, let pin = pins.first {
            map.setRegion(MKCoordinateRegion(center: pin.coordinate, latitudinalMeters: 2500, longitudinalMeters: 2500), animated: false)
        } else if !pins.isEmpty { map.showAnnotations(pins, animated: false) }
        if allowsPicking { map.addGestureRecognizer(UILongPressGestureRecognizer(target: self, action: #selector(dropPin(_:)))) }
    }

    @objc func cancel() { finish(["cancelled": true]) }
    @objc private func usePlace() {
        guard let selected = selected else { return }
        finish(["cancelled": false, "place": ["title": selected.title ?? "Selected place", "address": selected.address,
            "latitude": selected.coordinate.latitude, "longitude": selected.coordinate.longitude]])
    }
    private func finish(_ result: JSObject) {
        guard !finished else { return }
        finished = true
        searchGeneration += 1
        search?.cancel()
        searchBar.resignFirstResponder()
        dismiss(animated: true) { [completion] in completion(result) }
    }
    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        // Resolve once if another native view/controller removes this modal.
        if !finished && (isBeingDismissed || navigationController?.isBeingDismissed == true) {
            finished = true
            search?.cancel()
            completion(["cancelled": true])
        }
    }
    @objc private func dropPin(_ gesture: UILongPressGestureRecognizer) {
        guard allowsPicking, gesture.state == .began, !finished else { return }
        searchGeneration += 1
        search?.cancel()
        let pin = FamilyMapPin()
        pin.coordinate = map.convert(gesture.location(in: map), toCoordinateFrom: map)
        pin.title = "Selected place"
        map.addAnnotation(pin)
        map.selectAnnotation(pin, animated: true)
    }
    func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
        guard let pin = view.annotation as? FamilyMapPin else { return }
        selected = pin
        detail.text = [pin.title ?? "Place", pin.address].filter { !$0.isEmpty }.joined(separator: "\n")
        saveButton.isEnabled = allowsPicking
    }
    func searchBarSearchButtonClicked(_ searchBar: UISearchBar) {
        let query = (searchBar.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard allowsPicking, !query.isEmpty, query.count <= 250, !finished else { return }
        searchBar.resignFirstResponder()
        search?.cancel()
        searchGeneration += 1
        let generation = searchGeneration
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query
        request.region = map.region
        let current = MKLocalSearch(request: request)
        search = current
        selected = nil
        saveButton.isEnabled = false
        detail.text = "Searching Apple Maps…"
        current.start { [weak self] response, error in
            DispatchQueue.main.async {
                guard let self = self, !self.finished, self.searchGeneration == generation else { return }
                guard error == nil, let results = response?.mapItems, !results.isEmpty else {
                    self.detail.text = "No places found. Try a more specific address or press and hold on the map."
                    return
                }
                let annotations = results.prefix(20).map { item -> FamilyMapPin in
                    let pin = FamilyMapPin()
                    pin.coordinate = item.placemark.coordinate
                    pin.title = item.name ?? "Place"
                    pin.address = item.placemark.title ?? ""
                    pin.subtitle = pin.address
                    return pin
                }
                self.map.removeAnnotations(self.map.annotations)
                self.map.addAnnotations(annotations)
                self.map.showAnnotations(annotations, animated: true)
                self.selected = nil
                self.saveButton.isEnabled = false
                self.detail.text = "Tap a pin, then choose Use this place."
            }
        }
    }
}
