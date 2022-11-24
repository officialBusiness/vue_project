import DeveloperError from '../Core/DeveloperError.js';
import clone from '../Core/clone.js';
import Tween from '../ThirdParty/Tween.js';


/**
 * DOC_TBA
 *
 * @name AnimationCollection
 * @constructor
 */
export default function AnimationCollection() {
}

/**
 * DOC_TBA
 * @memberof AnimationCollection
 */
AnimationCollection.prototype.add = function(template) {
    var t = template || {};
    t.duration = (typeof t.duration === "undefined") ? 3000 : t.duration;
    t.delayDuration = (typeof t.delayDuration === "undefined") ? 0 : t.delayDuration;
    t.easingFunction = (typeof t.easingFunction === "undefined") ? Tween.Easing.Linear.EaseNone : t.easingFunction;

    var value = clone(t.startValue);
    var tween = new Tween.Tween(value);
    tween.to(t.stopValue, t.duration);
    tween.delay(t.delayDuration);
    tween.easing(t.easingFunction);
    if (t.onUpdate) {
        tween.onUpdate(function() {
            t.onUpdate(value);
        });
    }
    tween.onComplete(t.onComplete || null);
    tween.start();

    return {
        _tween : tween
    };
};

/**
 * DOC_TBA
 * @memberof AnimationCollection
 *
 * @exception {DeveloperError} material is required.
 * @exception {DeveloperError} material has no properties with alpha components.
 */
AnimationCollection.prototype.addAlpha = function(material, start, stop, template) {
    if (typeof material === "undefined") {
        throw new DeveloperError("material is required.", "material");
    }

    var properties = [];

    for ( var property in material) {
        if (material.hasOwnProperty(property) &&
            typeof material[property] !== "undefined" &&
            typeof material[property].alpha !== "undefined") {
            properties.push(property);
        }
    }

    if (properties.length === 0) {
        throw new DeveloperError("material has no properties with alpha components.", "material");
    }

    // Default to fade in
    start = (typeof start === "undefined") ? 0.0 : start;
    stop = (typeof stop === "undefined") ? 1.0 : stop;

    var t = template || {};
    t.duration = (typeof t.duration === "undefined") ? 3000 : t.duration;
    t.delayDuration = (typeof t.delayDuration === "undefined") ? 0 : t.delayDuration;
    t.easingFunction = (typeof t.easingFunction === "undefined") ? Tween.Easing.Linear.EaseNone : t.easingFunction;

    var value = {
        alpha : start
    };
    var tween = new Tween.Tween(value);
    tween.to({
        alpha : stop
    }, t.duration);
    tween.delay(t.delayDuration);
    tween.easing(t.easingFunction);
    tween.onUpdate(function() {
        var length = properties.length;
        for ( var i = 0; i < length; ++i) {
            material[properties[i]].alpha = value.alpha;
        }
    });
    tween.onComplete(t.onComplete || null);
    tween.start();

    return {
        _tween : tween
    };
};

/**
 * DOC_TBA
 * @memberof AnimationCollection
 */
AnimationCollection.prototype.addProperty = function(object, property, start, stop, template) {
    if (typeof object === "undefined") {
        throw new DeveloperError("object is required.", "object");
    }

    if (typeof property === "undefined") {
        throw new DeveloperError("property is required.", "property");
    }

    if (typeof object[property] === "undefined") {
        throw new DeveloperError("object must have the specified property.");
    }

    var t = template || {};
    t.duration = (typeof t.duration === "undefined") ? 3000 : t.duration;
    t.delayDuration = (typeof t.delayDuration === "undefined") ? 0 : t.delayDuration;
    t.easingFunction = (typeof t.easingFunction === "undefined") ? Tween.Easing.Linear.EaseNone : t.easingFunction;

    var value = {
        value : start
    };
    var tween = new Tween.Tween(value);
    tween.to({
        value : stop
    }, t.duration);
    tween.delay(t.delayDuration);
    tween.easing(t.easingFunction);
    tween.onUpdate(function() {
        object[property] = value.value;
    });
    tween.onComplete(t.onComplete || null);
    tween.start();

    return {
        _tween : tween
    };
};

/**
 * DOC_TBA
 * @memberof AnimationCollection
 *
 * @exception {DeveloperError} material is required.
 * @exception {DeveloperError} material must have an offset property.
 */
AnimationCollection.prototype.addOffsetIncrement = function(material, template) {
    if (typeof material === "undefined") {
        throw new DeveloperError("material is required.", "material");
    }

    if (typeof material.offset === "undefined") {
        throw new DeveloperError("material must have an offset property.", "material");
    }

    var t = template || {};
    t.duration = (typeof t.duration === "undefined") ? 3000 : t.duration;
    t.delayDuration = (typeof t.delayDuration === "undefined") ? 0 : t.delayDuration;
    t.easingFunction = (typeof t.easingFunction === "undefined") ? Tween.Easing.Linear.EaseNone : t.easingFunction;

    var value = {
        offset : material.offset
    };
    var tween = new Tween.Tween(value);
    tween.to({
        offset : material.offset + 1.0
    }, t.duration);
    tween.delay(t.delayDuration);
    tween.easing(t.easingFunction);
    tween.onUpdate(function() {
        material.offset = value.offset;
    });
    // t.onComplete is ignored.
    tween.onComplete(function() {
        tween.to({
            offset : material.offset + 1.0
        }, t.duration);
        tween.start();
    });
    tween.start();

    return {
        _tween : tween
    };
};

/**
 * DOC_TBA
 * @memberof AnimationCollection
 */
AnimationCollection.prototype.remove = function(animation) {
    if (animation) {
        var count = Tween.getAll().length;
        Tween.remove(animation._tween);

        return Tween.getAll().length === (count - 1);
    }

    return false;
};

/**
 * DOC_TBA
 * @memberof AnimationCollection
 */
AnimationCollection.prototype.removeAll = function() {
    Tween.removeAll();
};

/**
 * DOC_TBA
 * @memberof AnimationCollection
 */
AnimationCollection.prototype.update = function() {
    Tween.update();
};
