"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "@/lib/native-toast";

type OS = "unix" | "windows";

interface BootstrapCurlProps {
  // URL path (relative or absolute) we want the user's machine to fetch.
  bootstrapPath: string;
  // Where the file should land on disk. Unix-style with leading "~/".
  // The widget converts to "$HOME\..." for the PowerShell variant.
  outPath: string;
  label?: string;
}

function detectOS(): OS {
  if (typeof navigator === "undefined") return "unix";
  // userAgentData is modern + accurate; fall back to UA string.
  // We only need to know if the user is on Windows.
  const uaData = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData;
  if (uaData?.platform === "Windows") return "windows";
  if (navigator.userAgent.includes("Windows")) return "windows";
  return "unix";
}

function unixCmd(url: string, out: string) {
  return `curl -s "${url}" -o ${out} --create-dirs`;
}

function windowsCmd(url: string, out: string) {
  // Convert "~/..." -> "$HOME\..." with backslashes. The curl.exe form bypasses
  // PowerShell's Invoke-WebRequest alias, which doesn't accept unix flags.
  const winOut = out.replace(/^~\//, "$HOME\\").replace(/\//g, "\\");
  return `curl.exe -s "${url}" -o "${winOut}" --create-dirs`;
}

export function BootstrapCurl({ bootstrapPath, outPath, label }: BootstrapCurlProps) {
  const [os, setOs] = useState<OS>("unix");
  // Defer detection to the client to keep SSR output stable.
  useEffect(() => {
    setOs(detectOS());
  }, []);

  const [origin, setOrigin] = useState("https://app.noticomax.com");
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const url = `${origin}${bootstrapPath}`;
  const cmd = os === "windows" ? windowsCmd(url, outPath) : unixCmd(url, outPath);

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1.5 flex items-center justify-between">
        <span>{label ?? "Quick Setup"} (run on a new computer)</span>
        <span className="text-[10px] uppercase tracking-wider font-mono">
          {os === "windows" ? "PowerShell" : "macOS / Linux"}
        </span>
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono truncate">
          {cmd}
        </code>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => {
            navigator.clipboard.writeText(cmd);
            toast.success("Setup command copied");
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
      {os === "windows" && (
        <p className="text-[10px] text-muted-foreground mt-1">
          Uses <code className="bg-muted px-1 rounded font-mono">curl.exe</code> (ships with Windows 10+) to bypass PowerShell&apos;s built-in <code>curl</code> alias.
        </p>
      )}
    </div>
  );
}
