import "aframe";
import log from "loglevel";
import "aframe-extras";
import * as TWEEN from "@tweenjs/tween.js";
import "aframe-environment-component";
import * as XState from "xstate";
import * as RxJS from "rxjs";
import * as CosmicChef from "./client/index.ts";

// Default level for every named logger; debug() in dev/console-helpers.js changes it at runtime.
// setDefaultLevel keeps a level the developer persisted with setLevel().
log.setDefaultLevel("info");

// Expose globals for custom A-Frame components
window.log = log;
window.TWEEN = TWEEN;
window.XState = XState;
window.RxJS = RxJS;
window.CosmicChef = CosmicChef;
