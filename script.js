const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');
const emojiFrame = document.getElementById('emoji-frame');
const loadingText = document.getElementById('loading');
const mainLogo = document.getElementById('main-logo');

let isEmojiActive = false;

// --- Single Model: MediaPipe Hands ---
const hands = new Hands({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});

hands.setOptions({
    maxNumHands: 6,
    modelComplexity: 0, // Changed to 0 for Galaxy/mobile performance
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

function onHandsResults(results) {
    if (loadingText.style.opacity !== '0') {
        loadingText.style.opacity = '0';
        setTimeout(() => {
            loadingText.style.display = 'none';
            if (mainLogo) {
                mainLogo.classList.remove('hidden');
                mainLogo.classList.add('glitch-in');
            }
        }, 500);
    }

    if (canvasElement.width !== results.image.width || canvasElement.height !== results.image.height) {
        canvasElement.width = results.image.width;
        canvasElement.height = results.image.height;
    }

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks && results.multiHandedness) {
        const numHands = results.multiHandLandmarks.length;
        
        let leftCount = 0;
        let rightCount = 0;
        results.multiHandedness.forEach(handedness => {
            if (handedness.label === 'Left') leftCount++;
            else rightCount++;
        });

        // Determine Mode
        // Party mode: > 2 hands, or 2 hands of the same type (meaning >= 2 people)
        const isPartyMode = numHands >= 3 || leftCount >= 2 || rightCount >= 2;

        let drawnPairs = new Set();
        let borderEmojis = [];
        
        // 1. Check for pairwise TwoHandHeart
        for (let i = 0; i < numHands; i++) {
            for (let j = i + 1; j < numHands; j++) {
                if (drawnPairs.has(i) || drawnPairs.has(j)) continue;
                
                if (isTwoHandHeart(results.multiHandLandmarks[i], results.multiHandLandmarks[j])) {
                    if (isPartyMode) {
                        const h1 = results.multiHandLandmarks[i][0];
                        const h2 = results.multiHandLandmarks[j][0];
                        const cx = ((h1.x + h2.x) / 2) * canvasElement.width;
                        let cy = (Math.min(h1.y, h2.y)) * canvasElement.height;
                        drawFloatingEmoji('❤️', cx, cy - 80, 100);
                    } else {
                        borderEmojis = ['❤️', '❤️', '❤️', '❤️', '❤️', '❤️'];
                    }
                    drawnPairs.add(i);
                    drawnPairs.add(j);
                }
            }
        }

        // 2. Check individual gestures
        for (let i = 0; i < numHands; i++) {
            if (drawnPairs.has(i)) continue;
            const landmarks = results.multiHandLandmarks[i];
            const gesture = detectHandGesture(landmarks);
            if (gesture) {
                let emoji = '';
                switch(gesture) {
                    case 'THUMBS_UP': emoji = '👍'; break;
                    case 'OPEN_PALM': emoji = '👋'; break;
                    case 'FIST': emoji = '✊'; break;
                    case 'ROCK_AND_ROLL': emoji = '🤘'; break;
                    case 'ALOHA': emoji = '🤙'; break;
                    case 'CROSSED_FINGERS': emoji = '🤞'; break;
                    case 'V_SIGN': emoji = '✌️'; break;
                    case 'FINGER_HEART': emoji = '🫰'; break;
                }
                
                if (emoji) {
                    if (isPartyMode) {
                        let minY = canvasElement.height;
                        let avgX = 0;
                        for (const pt of landmarks) {
                            if (pt.y * canvasElement.height < minY) minY = pt.y * canvasElement.height;
                            avgX += pt.x * canvasElement.width;
                        }
                        avgX /= landmarks.length;
                        drawFloatingEmoji(emoji, avgX, minY - 40, 70);
                    } else {
                        // In solo mode, just take the first detected gesture
                        if (borderEmojis.length === 0) {
                            borderEmojis = Array(6).fill(emoji);
                        }
                    }
                }
            }
        }

        // 3. Handle Solo Mode Border Emojis
        if (!isPartyMode && borderEmojis.length > 0) {
            showEmojiFrame(borderEmojis);
        } else {
            hideEmojiFrame();
        }
    } else {
        hideEmojiFrame();
    }
    
    canvasCtx.restore();
}

function drawFloatingEmoji(emoji, x, y, size) {
    canvasCtx.save();
    canvasCtx.translate(x, y);
    canvasCtx.scale(-1, 1); // Un-mirror text for CSS mirrored canvas
    canvasCtx.font = `${size}px Arial`;
    canvasCtx.textAlign = 'center';
    canvasCtx.textBaseline = 'bottom';
    canvasCtx.filter = 'drop-shadow(0 0 10px rgba(255,255,255,0.8))';
    canvasCtx.fillText(emoji, 0, 0);
    canvasCtx.restore();
}

function detectHandGesture(handLandmarks) {
    if (!handLandmarks) return null;

    const wrist = handLandmarks[0];
    const palm = handLandmarks[9];

    // Check if finger is folded
    const isFolded = (tipIdx, mcpIdx) => {
        const tip = handLandmarks[tipIdx];
        const mcp = handLandmarks[mcpIdx];
        const distTip = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
        const distMcp = Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y);
        return distTip < distMcp * 1.2;
    };

    const distThumbTipPalm = Math.hypot(handLandmarks[4].x - palm.x, handLandmarks[4].y - palm.y);
    const distThumbMcpPalm = Math.hypot(handLandmarks[2].x - palm.x, handLandmarks[2].y - palm.y);
    
    const states = {
        thumb: distThumbTipPalm > distThumbMcpPalm * 1.2,
        index: !isFolded(8, 5),
        middle: !isFolded(12, 9),
        ring: !isFolded(16, 13),
        pinky: !isFolded(20, 17)
    };

    const extCount = Object.values(states).filter(Boolean).length;

    // Open Palm
    if (extCount >= 4 && states.index && states.middle && states.ring && states.pinky) return 'OPEN_PALM';

    // Thumbs Up
    if (states.thumb && !states.index && !states.middle && !states.ring && !states.pinky) {
        if (handLandmarks[4].y < handLandmarks[2].y) return 'THUMBS_UP';
    }

    // Fist
    if (!states.index && !states.middle && !states.ring && !states.pinky) {
        if (!states.thumb || handLandmarks[4].y >= handLandmarks[2].y) return 'FIST';
    }

    // Rock and Roll
    if (states.index && states.pinky && !states.middle && !states.ring) return 'ROCK_AND_ROLL';

    // Aloha (Shaka)
    if (states.thumb && states.pinky && !states.index && !states.middle && !states.ring) return 'ALOHA';

    // Index & Middle extended logic (V sign or Crossed fingers)
    if (states.index && states.middle && !states.ring && !states.pinky) {
        const indexTip = handLandmarks[8];
        const middleTip = handLandmarks[12];
        const dist = Math.hypot(indexTip.x - middleTip.x, indexTip.y - middleTip.y);
        
        if (dist < 0.05) return 'CROSSED_FINGERS';
        return 'V_SIGN';
    }

    // Finger Heart
    if (!states.middle && !states.ring && !states.pinky) {
        const thumbTip = handLandmarks[4];
        const indexTip = handLandmarks[8];
        const dist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
        
        const distIndexWrist = Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y);
        const distMcpWrist = Math.hypot(handLandmarks[5].x - wrist.x, handLandmarks[5].y - wrist.y);
        
        // 거리를 0.12로 늘려 인식률을 높이고, 검지가 손목 쪽으로 완전히 접힌(주먹) 상태와 구분
        if (dist < 0.12 && distIndexWrist > distMcpWrist * 1.1) return 'FINGER_HEART';
    }

    return null;
}

function isTwoHandHeart(leftHand, rightHand) {
    if (!leftHand || !rightHand) return false;

    const leftThumb = leftHand[4];
    const rightThumb = rightHand[4];
    const leftIndex = leftHand[8];
    const rightIndex = rightHand[8];

    const thumbDist = Math.hypot(leftThumb.x - rightThumb.x, leftThumb.y - rightThumb.y);
    const indexDist = Math.hypot(leftIndex.x - rightIndex.x, leftIndex.y - rightIndex.y);

    return thumbDist < 0.15 && indexDist < 0.15;
}

function showEmojiFrame(emojisArray) {
    const emojiElements = document.querySelectorAll('.emoji');
    emojiElements.forEach((el, index) => {
        el.innerText = emojisArray[index % emojisArray.length];
    });

    if (!isEmojiActive) {
        isEmojiActive = true;
        emojiFrame.classList.remove('hidden');
        emojiFrame.classList.add('visible');
        
        if (mainLogo) {
            mainLogo.classList.remove('hidden');
            mainLogo.classList.remove('glitch-in');
            void mainLogo.offsetWidth; // trigger reflow
            mainLogo.classList.add('glitch-in');
        }
    }
}

function hideEmojiFrame() {
    if (isEmojiActive) {
        isEmojiActive = false;
        emojiFrame.classList.remove('visible');
        emojiFrame.classList.add('hidden');
        
        if (mainLogo) {
            mainLogo.classList.add('hidden');
            mainLogo.classList.remove('glitch-in');
        }
    }
}

hands.onResults(onHandsResults);

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({image: videoElement});
    },
    facingMode: 'user'
});

camera.start();
