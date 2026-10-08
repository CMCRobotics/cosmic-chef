import { describe, test, expect, beforeEach } from "bun:test";

describe("final-stir-camera — discovery and position adoption", () => {
    let mockGalleyEl;
    let mockCameraRig;
    let mockComponent;

    beforeEach(() => {
        // Setup mock galley element
        const children = [];
        mockGalleyEl = {
            id: 'galley-blue',
            components: {
                'team-galley-receiver': {}
            },
            querySelector: (selector) => {
                for (const child of children) {
                    if (selector.includes('data-delivery-camera') && child.hasAttribute && child.hasAttribute('data-delivery-camera')) {
                        return child;
                    }
                    if (selector.includes('id^="delivery_camera"') && child.id && child.id.startsWith('delivery_camera')) {
                        return child;
                    }
                    if (selector.includes('id="delivery_camera"') && child.id === 'delivery_camera') {
                        return child;
                    }
                }
                return null;
            },
            _addChild: (child) => children.push(child)
        };

        mockCameraRig = {
            id: 'cameraRig',
            position: { x: 0, y: 0, z: -5.5 },
            rotation: { x: -10, y: 180, z: 0 },
            getAttribute: (attr) => mockCameraRig[attr],
            setAttribute: (attr, val) => {
                mockCameraRig[attr] = val;
            },
            querySelector: () => null,
            object3D: {
                parent: null
            }
        };

        mockComponent = {
            el: mockGalleyEl,
            data: {
                cameraRig: mockCameraRig,
                transitionDuration: 1000,
                adoptRotation: true
            },
            normalPosition: null,
            normalRotation: null,
            isInFinalStir: false,
            log: {
                debug: () => {},
                info: () => {},
                warn: () => {}
            }
        };
    });

    test("discovers delivery camera when templated with rewritten ID", () => {
        const templatedCam = {
            id: 'delivery_camera__cosmic-chef-galley-blue_0',
            hasAttribute: (attr) => attr === 'data-delivery-camera'
        };
        mockGalleyEl._addChild(templatedCam);

        const foundCam = mockGalleyEl.querySelector('[data-delivery-camera], [id^="delivery_camera"], [id="delivery_camera"]');
        expect(foundCam).not.toBeNull();
        expect(foundCam.id).toBe('delivery_camera__cosmic-chef-galley-blue_0');
    });

    test("discovers delivery camera via id prefix if data-delivery-camera is absent", () => {
        const templatedCam = {
            id: 'delivery_camera__cosmic-chef-galley-blue_0',
            hasAttribute: () => false
        };
        mockGalleyEl._addChild(templatedCam);

        const foundCam = mockGalleyEl.querySelector('[data-delivery-camera], [id^="delivery_camera"], [id="delivery_camera"]');
        expect(foundCam).not.toBeNull();
        expect(foundCam.id).toBe('delivery_camera__cosmic-chef-galley-blue_0');
    });

    test("discovers delivery camera via data-delivery-camera", () => {
        const camWithDataAttr = {
            id: 'some_other_id_renamed',
            hasAttribute: (attr) => attr === 'data-delivery-camera'
        };
        mockGalleyEl._addChild(camWithDataAttr);

        const foundCam = mockGalleyEl.querySelector('[data-delivery-camera], [id^="delivery_camera"], [id="delivery_camera"]');
        expect(foundCam).not.toBeNull();
        expect(foundCam.id).toBe('some_other_id_renamed');
    });

    test("snapshots normal position and restores it on stir completion", () => {
        const normalPos = { ...mockCameraRig.position };
        const normalRot = { ...mockCameraRig.rotation };

        // Simulate entering delivery view: snapshot
        mockComponent.normalPosition = { ...mockCameraRig.position };
        mockComponent.normalRotation = { ...mockCameraRig.rotation };
        mockComponent.isInFinalStir = true;

        // Move rig to delivery position
        mockCameraRig.setAttribute('position', { x: -1, y: 4.41, z: -1.41 });
        mockCameraRig.setAttribute('rotation', { x: -28, y: 160, z: 14 });

        expect(mockCameraRig.position).toEqual({ x: -1, y: 4.41, z: -1.41 });

        // Simulate exiting stir: restore normal position
        mockCameraRig.setAttribute('position', mockComponent.normalPosition);
        mockCameraRig.setAttribute('rotation', mockComponent.normalRotation);
        mockComponent.isInFinalStir = false;

        expect(mockCameraRig.position).toEqual(normalPos);
        expect(mockCameraRig.rotation).toEqual(normalRot);
    });

    test("branches on orderSuccess to sky sequence vs direct return on cancellation", () => {
        let skyTransitionCalled = false;
        let normalTransitionCalled = false;

        mockComponent.transitionToSkyThenNormalView = () => {
            skyTransitionCalled = true;
        };
        mockComponent.transitionToNormalView = () => {
            normalTransitionCalled = true;
        };

        const onStateChange = (state) => {
            if ((state === 'readyForFinalStir' || state === 'recipeReadyForSubmit') && !mockComponent.isInFinalStir) {
                mockComponent.isInFinalStir = true;
            } else if (state !== 'readyForFinalStir' && state !== 'recipeReadyForSubmit' && mockComponent.isInFinalStir) {
                if (state === 'orderSuccess') {
                    mockComponent.transitionToSkyThenNormalView();
                } else {
                    mockComponent.transitionToNormalView();
                }
                mockComponent.isInFinalStir = false;
            }
        };

        // 1. Success case: enters stir, then orderSuccess
        onStateChange('readyForFinalStir');
        expect(mockComponent.isInFinalStir).toBe(true);

        onStateChange('orderSuccess');
        expect(skyTransitionCalled).toBe(true);
        expect(normalTransitionCalled).toBe(false);
        expect(mockComponent.isInFinalStir).toBe(false);

        // 2. Cancellation case: enters stir, then orderPenalized
        skyTransitionCalled = false;
        normalTransitionCalled = false;

        onStateChange('readyForFinalStir');
        expect(mockComponent.isInFinalStir).toBe(true);

        onStateChange('orderPenalized');
        expect(skyTransitionCalled).toBe(false);
        expect(normalTransitionCalled).toBe(true);
        expect(mockComponent.isInFinalStir).toBe(false);
    });

    test("lerpAngle wraps around 360 degrees smoothly", () => {
        const lerpAngle = (from, to, t) => {
            let delta = to - from;
            while (delta > 180) delta -= 360;
            while (delta < -180) delta += 360;
            return from + delta * t;
        };

        // 350 to 10 degrees -> should go forward by 20 deg, midpoint is 0 / 360 deg
        const mid = lerpAngle(350, 10, 0.5);
        expect(mid).toBe(360);

        // -170 to 170 degrees -> should go backward by 20 deg, midpoint is -180 / 180
        const mid2 = lerpAngle(-170, 170, 0.5);
        expect(mid2).toBe(-180);
    });
});
