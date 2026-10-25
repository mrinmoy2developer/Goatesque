"use client";
import { useEffect } from "react";
export default function GameBoot() {
  useEffect(() => {
    const script=document.createElement("script");
    script.type="module";
    script.src="/game/start.mjs?session="+crypto.randomUUID();
    document.body.appendChild(script);
    return () => {script.remove();(window as Window & {dyo?:{destroy:()=>void}}).dyo?.destroy();};
  }, []);
  return null;
}
