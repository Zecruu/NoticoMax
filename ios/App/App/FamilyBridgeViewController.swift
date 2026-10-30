import Capacitor

@objc(FamilyBridgeViewController)
class FamilyBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(FamilyMapPlugin())
    }
}
