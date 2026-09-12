import "aframe";
import log from "loglevel";
import "aframe-extras";
import * as TWEEN from "@tweenjs/tween.js";
import "aframe-environment-component";
import * as XState from "xstate";

// Expose globals for custom A-Frame components
window.log = log;
window.TWEEN = TWEEN;
window.XState = XState;
