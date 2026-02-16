import { toast as sonnerToast, type ExternalToast } from "sonner";
import { hapticNotification } from "@/lib/capacitor/haptics";

export const toast = {
  success: (message: string, options?: ExternalToast) => {
    hapticNotification("success");
    return sonnerToast.success(message, options);
  },
  error: (message: string, options?: ExternalToast) => {
    hapticNotification("error");
    return sonnerToast.error(message, options);
  },
  warning: (message: string, options?: ExternalToast) => {
    hapticNotification("warning");
    return sonnerToast.warning(message, options);
  },
  info: (message: string, options?: ExternalToast) => {
    return sonnerToast.info(message, options);
  },
  message: (message: string, options?: ExternalToast) => {
    return sonnerToast.message(message, options);
  },
};
