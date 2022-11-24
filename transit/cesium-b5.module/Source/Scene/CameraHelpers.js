import CesiumMath from '../Core/Math.js';
import Cartesian2 from '../Core/Cartesian2.js';
import JulianDate from '../Core/JulianDate.js';

function move(camera, direction, rate) {
	var position = camera.position;
	var newPosition = position.add(direction.multiplyWithScalar(rate));
	camera.position = newPosition;
}

function decay(time, coefficient) {
	if (time < 0) {
		return 0.0;
	}

	var tau = (1.0 - coefficient) * 25.0;
	return Math.exp(-tau * time);
}

function sameMousePosition(movement) {
	return movement.startPosition.equalsEpsilon(movement.endPosition, CesiumMath.EPSILON14);
}

// If the time between mouse down and mouse up is not between
// these thresholds, the camera will not move with inertia.
// This value is probably dependent on the browser and/or the
// hardware. Should be investigated further.
var inertiaMaxClickTimeThreshold = 0.4;
var inertiaMaxTimeThreshold = 2.0;

function maintainInertia(handler, decayCoef, action, object, lastMovementName) {
	var ts = handler.getButtonPressTime();
	var tr = handler.getButtonReleaseTime();
	var threshold = ts && tr && ts.getSecondsDifference(tr);
	if (ts && tr && threshold < inertiaMaxClickTimeThreshold) {
		var now = new JulianDate();
		var fromNow = tr.getSecondsDifference(now);
		if (fromNow > inertiaMaxTimeThreshold) {
			return;
		}

		var d = decay(fromNow, decayCoef);

		if (!object[lastMovementName]) {
			var lastMovement = handler.getLastMovement();
			if (!lastMovement || sameMousePosition(lastMovement)) {
				return;
			}

			var motionX = (lastMovement.endPosition.x - lastMovement.startPosition.x) * 0.5;
			var motionY = (lastMovement.endPosition.y - lastMovement.startPosition.y) * 0.5;
			object[lastMovementName] = {
				startPosition : new Cartesian2(lastMovement.startPosition.x, lastMovement.startPosition.y),
				endPosition : new Cartesian2(lastMovement.startPosition.x + motionX * d, lastMovement.startPosition.y + motionY * d),
				motion : new Cartesian2(motionX, motionY)
			};
		} else {
			object[lastMovementName] = {
				startPosition : object[lastMovementName].endPosition.clone(),
				endPosition : new Cartesian2(
						object[lastMovementName].endPosition.x + object[lastMovementName].motion.x * d,
						object[lastMovementName].endPosition.y + object[lastMovementName].motion.y * d),
				motion : new Cartesian2(0.0, 0.0)
			};
		}

		// If value from the decreasing exponential function is close to zero,
		// the end coordinates may be NaN.
		if (isNaN(object[lastMovementName].endPosition.x) || isNaN(object[lastMovementName].endPosition.y) || sameMousePosition(object[lastMovementName])) {
			object[lastMovementName] = undefined;
			return;
		}

		if (!handler.isButtonDown()) {
			action.apply(object, [object[lastMovementName]]);
		}
	}
}

function handleZoom(object, movement, distanceMeasure) {
	// distanceMeasure should be the height above the ellipsoid.
	// The zoomRate slows as it approaches the surface and stops 20m above it.
	var maxHeight = 20.0;
	var zoomRate = object._zoomFactor * (distanceMeasure - maxHeight);

	if (zoomRate > object._maximumZoomRate) {
		zoomRate = object._maximumZoomRate;
	}

	var diff = movement.endPosition.y - movement.startPosition.y;
	if (diff === 0) {
		return;
	}

	var rangeWindowRatio = diff / object._canvas.clientHeight;
	var dist = zoomRate * rangeWindowRatio;

	if (dist > 0.0 && Math.abs(distanceMeasure - maxHeight) < 1.0) {
		return;
	}

	if (dist > 0.0) {
		object.zoomIn(dist);
	} else {
		object.zoomOut(-dist);
	}
}

function zoom(camera, rate) {
	move(camera, camera.direction, rate);
}

export default {
	move : move,
	handleZoom : handleZoom,
	maintainInertia : maintainInertia,
	zoom : zoom
}