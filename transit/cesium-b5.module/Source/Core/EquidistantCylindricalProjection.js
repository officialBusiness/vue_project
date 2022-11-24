import CesiumMath from './Math.js';
import Cartesian3 from './Cartesian3.js';
import Ellipsoid from './Ellipsoid.js';

/**
 * DOC_TBA
 * @name EquidistantCylindricalProjection
 * @constructor
 *
 * @immutable
 */
export default function EquidistantCylindricalProjection(ellipsoid) {
    ellipsoid = ellipsoid || Ellipsoid.WGS84;

    var radii = ellipsoid.getRadii();

    this._ellipsoid = ellipsoid;
    this._halfEquatorCircumference = Math.PI * (Math.max(radii.x, radii.y));
    this._quarterPolarCircumference = 0.5 * Math.PI * radii.z;
}

/*
 * DOC_TBA
 * @memberof EquidistantCylindricalProjection
 */
EquidistantCylindricalProjection.prototype.getEllipsoid = function() {
    return this._ellipsoid;
};

/*
 * DOC_TBA
 * @memberof EquidistantCylindricalProjection
 */
EquidistantCylindricalProjection.prototype.project = function(cartographic) {
    // Scale to [-1, 1]
    var lon = cartographic.longitude / Math.PI;
    var lat = cartographic.latitude / CesiumMath.PI_OVER_TWO;

    // Actually this is the special case of equidistant cylindrical called the plate carree
    return new Cartesian3(lon * this._halfEquatorCircumference, lat * this._quarterPolarCircumference, cartographic.height);
};
