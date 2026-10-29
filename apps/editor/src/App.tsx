import { useEffect, useState } from "react";
import { loadFonts } from "@clipai/engine";
import { useStore } from "./store";
import { loadPlugins } from "./blocks";
import { connectSync, sendOpen } from "./sync";
import { StartScreen } from "./components/StartScreen";
import { Editor } from "./components/Editor";
import { Toasts } from "./components/Toasts";

const hashProject = () => /^#\/p\/([^/]+)$/.exec(location.hash)?.[1] ?? null;

export function App() {
  const { name, dark, open, close, toast } = useStore();
  const [fontsReady, setFontsReady] = useState(false);
  const [pluginsVersion, setPluginsVersion] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    loadFonts("/fonts").then(() => setFontsReady(true));
    loadPlugins().then((list) => {
      const ok = list.filter((p) => !p.error && p.blocks.length);
      if (ok.length) useStore.setState({ pluginWarning: ok.flatMap((p) => p.blocks) });
      list.filter((p) => p.error).forEach((p) => toast(`Plugin failed: ${p.error}`, "error"));
      setPluginsVersion((v) => v + 1);
      const initial = hashProject();
      (initial ? open(initial).catch(() => close()) : Promise.resolve()).finally(() => setReady(true));
    });
    connectSync();
    const onHash = () => {
      const n = hashProject();
      if (!n) close();
      else if (n !== useStore.getState().name) open(n).catch((e) => toast((e as Error).message, "error"));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => sendOpen(name), [name]);

  return (
    <>
      {!ready ? <div className="p-8 text-muted">Loading…</div> : name ? <Editor fontsReady={fontsReady} pluginsVersion={pluginsVersion} /> : <StartScreen />}
      <Toasts />
    </>
  );
}
