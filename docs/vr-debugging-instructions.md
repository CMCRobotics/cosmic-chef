# VR debugging on a Meta Quest 3S

How to run `vr.html` from your PC on the headset, without HTTPS.

WebXR needs a secure context, and `http://localhost` counts as one. `adb reverse` makes the headset's `localhost` point at your PC, so the headset loads the dev server as if it were local.

---

## 1. One-time setup

1. **Turn on Developer Mode** on the Quest. In the Meta Horizon phone app, open the headset's settings and toggle Developer Mode. Meta may ask you to join a developer org at developer.oculus.com, which is free. The menu names change between app versions, so search the app for "developer mode" if you can't find it.
2. **Install Android platform-tools** on the PC, so that `adb` is on your PATH.
3. **Connect the Quest** to the PC with USB-C. Accept the USB debugging prompt inside the headset, then check that it is listed:

   ```bash
   adb devices
   ```

---

## 2. Each session

```bash
bun run dev                      # serves http://localhost:3000
adb reverse tcp:3000 tcp:3000    # headset localhost:3000 -> PC
adb reverse tcp:9001 tcp:9001    # MQTT websockets, if the broker runs on this PC
```

Then open this in the Quest browser, and enter VR from the page:

```
http://localhost:3000/vr.html?team=blue
```

The MQTT default `ws://localhost:9001` (see `MQTT_BROKER_URL` in `.env`) also resolves through the second `adb reverse`.

`adb reverse` lasts only while the Quest stays connected. Run it again after you unplug the headset or restart `adb`.

---

## 3. Debugging

**No PC console? Use the on-screen panel.** Add `debug=true` to the URL (for example `http://localhost:3000/vr.html?team=blue&debug=true`). A green text panel appears in front of the head chef's view. It lists the latest warnings and errors, uncaught exceptions, and hand controller events (connect, trigger, thumbstick press, thumbstick movement). Without `debug=true` the panel is not created.

Open `chrome://inspect/#devices` in desktop Chrome. It lists the headset's pages, and you can open the console for the `vr.html` page. The loglevel output (`window.log`) and any errors appear there. Use `debug(true)` in that console for verbose logs, as described in [`AGENTS.md`](../AGENTS.md).

---

## 4. Fallbacks

- **Quest browser flag (no USB needed):** in the Quest browser, add your PC's `http://<LAN-IP>:3000` under *Insecure origins treated as secure*. The flag and the address both need changing each time the PC's IP changes.
- **HTTPS tunnel (ngrok or cloudflared):** gives a real HTTPS URL. It is quick, but it puts your local server on the public internet, so only use it for a short session.
