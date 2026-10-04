/**
 * Sous-Chef Gesture Feedback Component
 *
 * A-Frame component that subscribes to XState game state and provides
 * visual/audio feedback for sous-chef gestures.
 *
 * Usage:
 * <a-entity sous-chef-gesture-feedback="sousChefId: 1; feedbackType: visual"></a-entity>
 */

AFRAME.registerComponent("sous-chef-gesture-feedback", {
  schema: {
    sousChefId: { type: "number", default: 1 },
    feedbackType: { default: "visual" }, // 'visual', 'audio', or 'both'
  },

  init: function () {
    const self = this;
    const el = this.el;
    const log = window.log?.getLogger("sous-chef-feedback") || console;

    log.info(
      `[INIT] Initializing gesture feedback for sous-chef ${self.data.sousChefId}`
    );

    // Store current gesture state
    self.currentGesture = "idle";
    self.isActive = false;

    // Find the three utensil indicators by ID
    if (
      self.data.feedbackType === "visual" ||
      self.data.feedbackType === "both"
    ) {
      const sousId = self.data.sousChefId;
      self.utensils = {
        knife: document.getElementById(`sous-chef-${sousId}-knife`),
        hammer: document.getElementById(`sous-chef-${sousId}-hammer`),
        spoon: document.getElementById(`sous-chef-${sousId}-spoon`),
      };

      if (!self.utensils.knife || !self.utensils.hammer || !self.utensils.spoon) {
        log.error(`[INIT] Missing utensil elements for sous-chef ${sousId}:`, {
          knife: !!self.utensils.knife,
          hammer: !!self.utensils.hammer,
          spoon: !!self.utensils.spoon,
        });
      } else {
        log.info(`[INIT] Found all utensils for sous-chef ${sousId}`);
      }

      // Map gestures to utensils
      self.gestureToUtensil = {
        slice: "knife",
        tenderize: "hammer",
        stir: "spoon",
        dice: "knife",
        smash: "hammer",
      };
    }

    // Track the current gameActor to detect if it changes
    let currentGameActor = null;

    // Wait for game state to be available — keep polling until found (no timeout)
    const waitForGameActor = setInterval(() => {
      // If gameActor changed (e.g., game-manager created a new one), resubscribe
      if (window.gameActor && window.gameActor !== currentGameActor) {
        // Unsubscribe from old actor if any
        if (self.unsubscribeFromState?.unsubscribe) {
          self.unsubscribeFromState.unsubscribe();
          log.debug(`Unsubscribed from old gameActor for SC${self.data.sousChefId}`);
        }

        currentGameActor = window.gameActor;

        // Reset gesture state so we detect changes after resubscription
        self.currentGesture = "idle";

        // Create subscription with direct reference to avoid closure issues
        const callback = (state) => {
          log.debug(`[SUB CALLBACK] State changed for SC${self.data.sousChefId}`);
          if (self.onStateChange) {
            self.onStateChange(state);
          }
        };

        self.unsubscribeFromState = window.gameActor.subscribe(callback);
        log.info(
          `Gesture feedback subscribed to game state for sous-chef ${self.data.sousChefId}. Sub: ${!!self.unsubscribeFromState}`
        );
      }
    }, 100);

    // Store for cleanup
    self.waitForGameActor = waitForGameActor;

    // Cleanup
    el.addEventListener("remove", () => {
      if (self.waitForGameActor) clearInterval(self.waitForGameActor);
      if (self.unsubscribeFromState?.unsubscribe) {
        self.unsubscribeFromState.unsubscribe();
      }
    });
  },


  onStateChange: function (state) {
    const log = window.log?.getLogger("sous-chef-feedback") || console;
    const sousChefId = this.data.sousChefId;

    // Access the sous-chef's state from the game context
    const sousChefState = state.context?.sousChefs?.[sousChefId];

    if (!sousChefState) {
      log.debug(`No sousChefs context for ${sousChefId}. State:`, state.value);
      return;
    }

    const gesture = sousChefState.gesture || "idle";
    const isHolding = state.matches?.(
      `active.cooking.PreparingComplexDish.Processing.HoldingGesture`
    );

    if (gesture !== this.currentGesture) {
      log.info(
        `Sous-Chef ${sousChefId}: gesture changed from ${this.currentGesture} to ${gesture} (state: ${state.value})`
      );
      this.currentGesture = gesture;

      if (!this.utensils) {
        log.warn(`Utensils not found for sous-chef ${sousChefId}`);
        return;
      }

      this.updateFeedback(gesture, isHolding);
    }
  },

  updateFeedback: function (gesture, isHolding) {
    const log = window.log?.getLogger("sous-chef-feedback") || console;
    const el = this.el;
    const feedbackType = this.data.feedbackType;

    if (
      feedbackType === "visual" ||
      feedbackType === "both"
    ) {
      this.updateVisualFeedback(gesture, isHolding);
    }

    if (
      feedbackType === "audio" ||
      feedbackType === "both"
    ) {
      this.playAudioFeedback(gesture);
    }

    // Emit custom event for external listeners
    el.emit("sous-chef-gesture-update", {
      sousChefId: this.data.sousChefId,
      gesture,
      isHolding,
    });
  },

  updateVisualFeedback: function (gesture, isHolding) {
    const log = window.log?.getLogger("sous-chef-feedback") || console;
    if (!this.utensils) {
      log.warn(`No utensils found for gesture update`);
      return;
    }

    log.debug(`Updating visual feedback for ${gesture}`);

    // Hide all utensils first
    Object.values(this.utensils).forEach((utensil) => {
      if (utensil) {
        utensil.setAttribute("visible", "false");
        utensil.removeAttribute("animation");
        utensil.removeAttribute("animation__secondary");
      }
    });

    if (gesture === "idle") {
      // Hide all utensils on idle
      return;
    }

    // Get the utensil for this gesture
    const utensilType = this.gestureToUtensil[gesture];
    const activeUtensil = this.utensils[utensilType];

    if (!activeUtensil) {
      log.warn(`No utensil mapped for gesture: ${gesture}`);
      return;
    }

    // Show the active utensil
    activeUtensil.setAttribute("visible", "true");

    // Apply gesture-specific animation
    if (gesture === "tenderize") {
      // Rapid up-down bouncing (hammering motion)
      activeUtensil.setAttribute(
        "animation",
        "property: position; from: 0 0 0; to: 0 0.3 0; dur: 200; easing: easeInOutQuad; loop: true; direction: alternate"
      );
    } else if (gesture === "slice" || gesture === "dice") {
      // Fast side-to-side slashing motion
      activeUtensil.setAttribute(
        "animation",
        "property: rotation; from: 0 0 -20; to: 0 0 20; dur: 300; easing: easeInOutQuad; loop: true; direction: alternate"
      );
    } else if (gesture === "stir") {
      // Circular rotation motion
      activeUtensil.setAttribute(
        "animation",
        "property: rotation; from: 0 0 0; to: 0 360 0; dur: 1000; loop: true"
      );
    } else if (gesture === "smash") {
      // Fast down-bounce motion
      activeUtensil.setAttribute(
        "animation",
        "property: position; from: 0 0 0; to: 0 -0.2 0; dur: 150; easing: easeInOutQuad; loop: true; direction: alternate"
      );
    }
  },

  playAudioFeedback: function (gesture) {
    // Map gestures to audio cues
    const audioMap = {
      slice: "gesture-slice",
      dice: "gesture-dice",
      stir: "gesture-stir",
      smash: "gesture-smash",
      tenderize: "gesture-tenderize",
    };

    const audioId = audioMap[gesture];
    if (audioId) {
      const audioEl = document.getElementById(audioId);
      if (audioEl) {
        audioEl.components.sound?.playSound();
      }
    }
  },

  remove: function () {
    if (this.unsubscribeFromState?.unsubscribe) {
      this.unsubscribeFromState.unsubscribe();
    }
  },
});
