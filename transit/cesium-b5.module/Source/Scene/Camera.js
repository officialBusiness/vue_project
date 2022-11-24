import DeveloperError from '../Core/DeveloperError.js';
import destroyObject from '../Core/destroyObject.js';
import CesiumMath from '../Core/Math.js';
import Intersect from '../Core/Intersect.js';
import Ellipsoid from '../Core/Ellipsoid.js';
import IntersectionTests from '../Core/IntersectionTests.js';
import Cartesian3 from '../Core/Cartesian3.js';
import Cartesian4 from '../Core/Cartesian4.js';
import Cartographic3 from '../Core/Cartographic3.js';
import Matrix4 from '../Core/Matrix4.js';
import CameraControllerCollection from './CameraControllerCollection.js';
import PerspectiveFrustum from './PerspectiveFrustum.js';

/**
 * The camera is defined by a position, orientation, and view frustum.
 * <br /><br />
 * The orientation forms an orthonormal basis with a view, up and right = view x up unit vectors.
 * <br /><br />
 * The viewing frustum is defined by 6 planes.
 * Each plane is represented by a {Cartesian4} object, where the x, y, and z components
 * define the unit vector normal to the plane, and the w component is the distance of the
 * plane from the origin/camera position.
 *
 * @name Camera
 *
 * @exception {DeveloperError} canvas is required.
 *
 * @constructor
 *
 * @example
 * // Create a camera looking down the negative z-axis, positioned at the origin,
 * // with a field of view of 60 degrees, and 1:1 aspect ratio.
 * var camera = new Camera(canvas);
 * camera.position = new Cartesian3();
 * camera.direction = Cartesian3.UNIT_Z.negate();
 * camera.up = Cartesian3.UNIT_Y;
 * camera.fovy = CesiumMath.PI_OVER_THREE;
 * camera.near = 1.0;
 * camera.far = 2.0;
 */
export default function Camera(canvas) {
    if(!canvas) {
        throw new DeveloperError("canvas is required.", "canvas");
    }

    var maxRadii = Ellipsoid.WGS84.getRadii().getMaximumComponent();

    /**
     * DOC_TBA
     *
     * @type {Matrix4}
     */
    this.transform = Matrix4.IDENTITY;
    this._transform = this.transform.clone();
    this._invTransform = Matrix4.IDENTITY;

    var position = new Cartesian3(0.0, -2.0, 1.0).normalize().multiplyWithScalar(2.0 * maxRadii);
    var direction = Cartesian3.ZERO.subtract(position).normalize();
    var right = direction.cross(Cartesian3.UNIT_Z).normalize();
    var up = right.cross(direction);

    /**
     * The position of the camera.
     *
     * @type {Cartesian3}
     */
    this.position = position;
    this._position = position.clone();

    /**
     * The view direction of the camera.
     *
     * @type {Cartesian3}
     */
    this.direction = direction;
    this._direction = direction.clone();

    /**
     * The up direction of the camera.
     *
     * @type {Cartesian3}
     */
    this.up = up;
    this._up = up.clone();

    /**
     * The right direction of the camera.
     *
     * @type {Cartesian3}
     */
    this.right = right;
    this._right = right.clone();

    /**
     * DOC_TBA
     *
     * @type {Frustum}
     */
    this.frustum = new PerspectiveFrustum();
    this.frustum.fovy = CesiumMath.toRadians(60.0);
    this.frustum.aspectRatio = canvas.clientWidth / canvas.clientHeight;
    this.frustum.near = 0.01 * maxRadii;
    this.frustum.far = 20.0 * maxRadii;

    this._viewMatrix = undefined;
    this._invViewMatrix = undefined;
    this._updateViewMatrix();

    this._planes = undefined;
    this._updatePlanes();

    this._canvas = canvas;
    this._controllers = new CameraControllerCollection(this, canvas);
}

/**
 * DOC_TBA
 * @memberof Camera
 */
Camera.prototype.getControllers = function() {
    return this._controllers;
};

/**
 * DOC_TBA
 * @memberof Camera
 */
Camera.prototype.update = function() {
    this._controllers.update();
};

/**
 * Sets the camera position and orientation with an eye position, target, and up vector.
 *
 * @memberof Camera
 *
 * @param {Array} arguments If one parameter is passed to this function, it must have three
 * properties with the names eye, target, and up; otherwise three arguments are expected which
 * the same as the properties of one object and given in the order given above.
 *
 */
Camera.prototype.lookAt = function() {
    var eye, target, up;
    if(arguments.length === 1) {
        var param = arguments[0];
        if(param.eye && param.target && param.up) {
            eye = param.eye;
            target = param.target;
            up = param.up;
        } else {
            return;
        }
    } else if(arguments.length === 3) {
        eye = arguments[0];
        target = arguments[1];
        up = arguments[2];
    } else {
        return;
    }

    this.position = eye;
    this.direction = target.subtract(eye).normalize();
    this.up = up.normalize();
    this.right = this.direction.cross(this.up);
};

/**
 * Zooms to a cartographic extent on the centralBody. The camera will be looking straight down at the extent, with the up vector pointing toward local north.
 *
 * @memberof Camera
 * @param {Ellipsoid} ellipsoid The ellipsoid to view.
 * @param {double} west The west longitude of the extent.
 * @param {double} south The south latitude of the extent.
 * @param {double} east The east longitude of the extent.
 * @param {double} north The north latitude of the extent.
 *
 */
Camera.prototype.viewExtent = function(ellipsoid, west, south, east, north) {
    //
    // Ensure we go from -180 to 180
    //
    west = CesiumMath.negativePiToPi(west);
    east = CesiumMath.negativePiToPi(east);

    // If we go across the International Date Line
    if(west > east) {
        east += CesiumMath.TWO_PI;
    }

    var lla = new Cartographic3(0.5 * (west + east), 0.5 * (north + south), 0.0);
    var northVector = ellipsoid.toCartesian(new Cartographic3(lla.longitude, north, 0.0));
    var eastVector = ellipsoid.toCartesian(new Cartographic3(east, lla.latitude, 0.0));
    var centerVector = ellipsoid.toCartesian(lla);
    var invTanHalfPerspectiveAngle = 1.0 / Math.tan(0.5 * this.frustum.fovy);
    var screenViewDistanceX;
    var screenViewDistanceY;
    var tempVec;
    if(this._canvas.clientWidth >= this._canvas.clientHeight) {
        tempVec = eastVector.subtract(centerVector);
        screenViewDistanceX = Math.sqrt(tempVec.dot(tempVec) * invTanHalfPerspectiveAngle);
        tempVec = northVector.subtract(centerVector);
        screenViewDistanceY = Math.sqrt(tempVec.dot(tempVec) * invTanHalfPerspectiveAngle * this._canvas.clientWidth / this._canvas.clientHeight);
    } else {
        tempVec = eastVector.subtract(centerVector);
        screenViewDistanceX = Math.sqrt(tempVec.dot(tempVec) * invTanHalfPerspectiveAngle * this._canvas.clientWidth / this._canvas.clientHeight);
        tempVec = northVector.subtract(centerVector);
        screenViewDistanceY = Math.sqrt(tempVec.dot(tempVec) * invTanHalfPerspectiveAngle);
    }
    lla.height += Math.max(screenViewDistanceX, screenViewDistanceY);

    this.position = ellipsoid.toCartesian(lla);
    this.direction = Cartesian3.ZERO.subtract(centerVector).normalize();
    this.right = this.direction.cross(Cartesian3.UNIT_Z).normalize();
    this.up = this.right.cross(this.direction);
};

Camera.prototype._orthonormalizeAxes = function() {
    this._direction = this._direction.normalize();

    var invUpMag = 1.0 / this._up.magnitudeSquared();
    var scalar = this._up.dot(this._direction) * invUpMag;
    var w0 = this._direction.multiplyWithScalar(scalar);
    this._up = this._up.subtract(w0).normalize();

    this._right = this._direction.cross(this._up);
};

Camera.prototype._updateViewMatrix = function() {
    var r = this._right;
    var u = this._up;
    var d = this._direction;
    var e = this._position;

    this._viewMatrix = new Matrix4(r.x, r.y, r.z, -r.dot(e), u.x, u.y, u.z, -u.dot(e), -d.x, -d.y, -d.z, d.dot(e), 0.0, 0.0, 0.0, 1.0);
    this._viewMatrix = this._viewMatrix.multiplyWithMatrix(this._invTransform);

    this._invViewMatrix = this._viewMatrix.inverseTransformation();
};

Camera.prototype._updatePlanes = function() {
    var position = new Cartesian4(this._position.x, this._position.y, this._position.z, 1.0);
    position = this._transform.multiplyWithVector(position).getXYZ();

    var direction = new Cartesian4(this._direction.x, this._direction.y, this._direction.z, 0.0);
    direction = this._transform.multiplyWithVector(direction).getXYZ();

    var up = new Cartesian4(this._up.x, this._up.y, this._up.z, 0.0);
    up = this._transform.multiplyWithVector(up).getXYZ();

    this._planes = this.frustum.getPlanes(position, direction, up);
};

Camera.prototype._update = function() {
    if ((this.position && !this.position.equals(this._position)) || (this.direction && !this.direction.equals(this._direction)) || (this.up && !this.up.equals(this._up)) ||
            (this.right && !this.right.equals(this._right)) || (this.transform && !this.transform.equals(this._transform))) {

        this._position = this.position && this.position.clone();
        this._direction = this.direction && this.direction.clone();
        this._up = this.up && this.up.clone();
        this._right = this.right && this.right.clone();
        this._transform = this.transform && this.transform.clone();
        this._invTransform = this._transform.inverseTransformation();

        var det = this._direction.dot(this._up.cross(this._right));
        if(Math.abs(1.0 - det) > CesiumMath.EPSILON2) {
            this._orthonormalizeAxes();
        }

        this.position = this._position.clone();
        this.direction = this._direction.clone();
        this.up = this._up.clone();
        this.right = this._right.clone();

        this._updateViewMatrix();
        this._updatePlanes();
    }
};

/**
 * DOC_TBA
 *
 * @memberof Camera
 *
 * @return {Matrix4} DOC_TBA
 */
Camera.prototype.getInverseTransform = function() {
    this._update();
    return this._invTransform;
};

/**
 * Returns the view matrix.
 *
 * @memberof Camera
 *
 * @return {Matrix4} The view matrix.
 *
 * @see UniformState#getView
 * @see UniformState#setView
 * @see agi_view
 */
Camera.prototype.getViewMatrix = function() {
    this._update();
    return this._viewMatrix;
};

/**
 * DOC_TBA
 * @memberof Camera
 */
Camera.prototype.getInverseViewMatrix = function() {
    this._update();
    return this._invViewMatrix;
};

/**
 * DOC_TBA
 * @memberof Camera
 */
Camera.prototype.getPickRay = function(windowPosition) {
    var width = this._canvas.clientWidth;
    var height = this._canvas.clientHeight;

    var tanPhi = Math.tan(this.frustum.fovy * 0.5);
    var tanTheta = this.frustum.aspectRatio * tanPhi;
    var near = this.frustum.near;

    var x = (2.0 / width) * windowPosition.x - 1.0;
    var y = (2.0 / height) * (height - windowPosition.y) - 1.0;

    var nearCenter = this.position.add(this.direction.multiplyWithScalar(near));
    var xDir = this.right.multiplyWithScalar(x * near * tanTheta);
    var yDir = this.up.multiplyWithScalar(y * near * tanPhi);
    var direction = nearCenter.add(xDir).add(yDir).subtract(this.position).normalize();

    return {
        position : this.position.clone(),
        direction : direction
    };
};

/**
 * DOC_TBA
 * @memberof Camera
 */
Camera.prototype.pickEllipsoid = function(ellipsoid, windowPosition) {
    var ray = this.getPickRay(windowPosition);
    var intersection = IntersectionTests.rayEllipsoid(ray.position, ray.direction, ellipsoid);
    if(!intersection) {
        return null;
    }

    var iPt = ray.position.add(ray.direction.multiplyWithScalar(intersection.start));
    return iPt;
};

/**
 * Determines whether a bounding volume intersects with the frustum or not.
 *
 * @memberof Camera
 *
 * @param {Object} object The bounding volume whose intersection with the frustum is to be tested.
 * @param {Function} planeIntersectTest The function that tests for intersections between a plane
 * and the bounding volume type of object
 *
 * @return {Enumeration}  Intersect.OUTSIDE,
 *                                 Intersect.INTERSECTING, or
 *                                 Intersect.INSIDE.
 */
Camera.prototype.getVisibility = function(object, planeIntersectTest) {
    this._update();
    var planes = this._planes;
    var intersecting = false;
    for(var k = 0; k < planes.length; k++) {
        var result = planeIntersectTest(object, planes[k]);
        if(result === Intersect.OUTSIDE) {
            return Intersect.OUTSIDE;
        } else if(result === Intersect.INTERSECTING) {
            intersecting = true;
        }
    }

    return intersecting ? Intersect.INTERSECTING : Intersect.INSIDE;
};

/**
 * Returns a duplicate of a Camera instance.
 *
 * @memberof Camera
 *
 * @return {Camera} A new copy of the Camera instance.
 */
Camera.prototype.clone = function() {
    var camera = new Camera(this._canvas);
    camera.position = this.position.clone();
    camera.direction = this.direction.clone();
    camera.up = this.up.clone();
    camera.right = this.right.clone();
    camera.transform = this.transform.clone();
    camera.frustum = this.frustum.clone();
    return camera;
};

/**
 * Returns true if this object was destroyed; otherwise, false.
 * <br /><br />
 * If this object was destroyed, it should not be used; calling any function other than
 * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.
 *
 * @memberof Camera
 *
 * @return {Boolean} <code>true</code> if this object was destroyed; otherwise, <code>false</code>.
 *
 * @see Camera#destroy
 */
Camera.prototype.isDestroyed = function() {
    return false;
};

/**
 * Removes keyboard listeners held by this object.
 * <br /><br />
 * Once an object is destroyed, it should not be used; calling any function other than
 * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.  Therefore,
 * assign the return value (<code>undefined</code>) to the object as done in the example.
 *
 * @memberof Camera
 *
 * @return {undefined}
 *
 * @exception {DeveloperError} This object was destroyed, i.e., destroy() was called.
 *
 * @see Camera#isDestroyed
 *
 * @example
 * camera = camera && camera.destroy();
 */
Camera.prototype.destroy = function() {
    this._controllers.destroy();
    return destroyObject(this);
};