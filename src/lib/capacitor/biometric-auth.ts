import { isCapacitorNative } from "@/lib/platform";

export async function checkBiometricAvailability(): Promise<boolean> {
  if (!isCapacitorNative()) return false;
  const { NativeBiometric } = await import("capacitor-native-biometric");
  try {
    const result = await NativeBiometric.isAvailable();
    return result.isAvailable;
  } catch {
    return false;
  }
}

export async function authenticateWithBiometric(): Promise<boolean> {
  if (!isCapacitorNative()) return true;
  const { NativeBiometric } = await import("capacitor-native-biometric");
  try {
    await NativeBiometric.verifyIdentity({
      reason: "Unlock Notico Max",
      title: "Notico Max",
      subtitle: "Verify your identity",
      description: "Use biometrics to access your notes",
    });
    return true;
  } catch {
    return false;
  }
}
