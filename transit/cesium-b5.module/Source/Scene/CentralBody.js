import DeveloperError from '../Core/DeveloperError.js';
import RuntimeError from '../Core/RuntimeError.js';
import combine from '../Core/combine.js';
import destroyObject from '../Core/destroyObject.js';
import CesiumMath from '../Core/Math.js';
import Intersect from '../Core/Intersect.js';
import Occluder from '../Core/Occluder.js';
import Ellipsoid from '../Core/Ellipsoid.js';
import BoundingSphere from '../Core/BoundingSphere.js';
import Rectangle from '../Core/Rectangle.js';
import Cache from '../Core/Cache.js';
import Cartesian2 from '../Core/Cartesian2.js';
import Cartesian3 from '../Core/Cartesian3.js';
import Cartesian4 from '../Core/Cartesian4.js';
import Cartographic2 from '../Core/Cartographic2.js';
import Matrix3 from '../Core/Matrix3.js';
import Queue from '../Core/Queue.js';
import ComponentDatatype from '../Core/ComponentDatatype.js';
import IndexDatatype from '../Core/IndexDatatype.js';
import MeshFilters from '../Core/MeshFilters.js';
import PrimitiveType from '../Core/PrimitiveType.js';
import CubeMapEllipsoidTessellator from '../Core/CubeMapEllipsoidTessellator.js';
import ExtentTessellator from '../Core/ExtentTessellator.js';
import PlaneTessellator from '../Core/PlaneTessellator.js';
import JulianDate from '../Core/JulianDate.js';
import BufferUsage from '../Renderer/BufferUsage.js';
import CullFace from '../Renderer/CullFace.js';
import DepthFunction from '../Renderer/DepthFunction.js';
import PixelFormat from '../Renderer/PixelFormat.js';
import MipmapHint from '../Renderer/MipmapHint.js';
import TextureMagnificationFilter from '../Renderer/TextureMagnificationFilter.js';
import TextureMinificationFilter from '../Renderer/TextureMinificationFilter.js';
import TextureWrap from '../Renderer/TextureWrap.js';
import Projections from './Projections.js';
import Tile from './Tile.js';
import TileState from './TileState.js';
import SceneMode from './SceneMode.js';
import Texture2DPool from './Texture2DPool.js';
import ViewportQuad from './ViewportQuad.js';
import CentralBodyVS from '../Shaders/CentralBodyVS.js';
import CentralBodyFS from '../Shaders/CentralBodyFS.js';
import CentralBodyVSDepth from '../Shaders/CentralBodyVSDepth.js';
import CentralBodyFSDepth from '../Shaders/CentralBodyFSDepth.js';
import CentralBodyVSFilter from '../Shaders/CentralBodyVSFilter.js';
import CentralBodyFSFilter from '../Shaders/CentralBodyFSFilter.js';
import SkyAtmosphereFS from '../Shaders/SkyAtmosphereFS.js';
import SkyAtmosphereVS from '../Shaders/SkyAtmosphereVS.js';


function TileTextureCachePolicy(description) {
    var desc = description || {};

    if (!desc.fetchFunc || typeof desc.fetchFunc !== "function") {
        throw new DeveloperError("description.fetchFunc is a required function.", "description.fetchFunc");
    }

    this._limit = desc.limit || 128;
    this._count = 0;
    this._fetchFunc = desc.fetchFunc;
    this._removeFunc = (typeof desc.removeFunc === "function") ? desc.removeFunc : undefined;
}

TileTextureCachePolicy.prototype.hit = function(object) {
    var time = new JulianDate();
    var current = object.key;
    while (current) {
        current._lastHit = time;
        current = current.parent;
    }
    return object.value;
};

TileTextureCachePolicy.prototype.miss = function(name, key, object) {
    var property = {
        key : key,
        value : undefined
    };

    property.value = this._fetchFunc(key);
    var lruTime = new JulianDate();
    this.hit(property);

    if (this._count < this._limit) {
        ++this._count;
        object[name] = property;
        return property.value;
    }

    var element;
    var index = '';
    var keys = Object.keys(object);
    for ( var i = 0; i < keys.length; ++i) {
        element = object[keys[i]];
        if (element.key._lastHit.lessThan(lruTime) && element.key.zoom > 2) {
            lruTime = element.key._lastHit;
            index = keys[i];
        }
    }

    element = object[index];
    if (this._removeFunc) {
        this._removeFunc(element.key);
    }
    delete object[index];

    object[name] = property;
    return property.value;
};

var attributeIndices = {
    position3D : 0,
    textureCoordinates : 1,
    position2D : 2
};

/**
 * DOC_TBA
 *
 * @param {Camera} camera DOC_TBA
 * @param {Ellipsoid} [ellipsoid=WGS84 Ellipsoid] Determines the size and shape of the central body.
 *
 * @name CentralBody
 * @constructor
 *
 * @exception {DeveloperError} camera is required.
 */
export default function CentralBody(camera, ellipsoid) {
    if (!camera) {
        throw new DeveloperError("camera is required.", "camera");
    }

    ellipsoid = ellipsoid || Ellipsoid.WGS84;

    this._ellipsoid = ellipsoid;
    this._maxExtent = {
        north : CesiumMath.PI_OVER_TWO,
        south : -CesiumMath.PI_OVER_TWO,
        west : -CesiumMath.PI,
        east : CesiumMath.PI
    };
    this._camera = camera;
    this._rootTile = new Tile({
        extent : this._maxExtent,
        zoom : 0,
        ellipsoid : ellipsoid
    });

    this._renderQueue = new Queue();
    this._imageQueue = new Queue();
    this._textureQueue = new Queue();
    this._reprojectQueue = new Queue();

    this._texturePool = undefined;
    this._textureCache = undefined;
    this._textureCacheLimit = 512; // TODO: pick appropriate cache limit

    // TODO: pick appropriate throttle limits
    this._textureThrottleLimit = 10;
    this._reprojectThrottleLimit = 10;
    this._imageThrottleLimit = 15;

    this._prefetchLimit = 1;
    this._tileFailCount = 0;
    this._lastFailedTime = undefined;

    /**
     * DOC_TBA
     *
     * @type {Number}
     */
    this.perTileMaxFailCount = 3;

    /**
     * DOC_TBA
     *
     * @type {Number}
     */
    this.maxTileFailCount = 30;

    /**
     * DOC_TBA
     *
     * @type {Number}
     */
    this.failedTileRetryTime = 30.0;


    this._spWithoutAtmosphere = undefined;
    this._spGroundFromSpace = undefined;
    this._spGroundFromAtmosphere = undefined;
    this._sp = undefined; // Reference to without-atmosphere, ground-from-space, or ground-from-atmosphere
    this._rsColor = undefined;

    this._spSkyFromSpace = undefined;
    this._spSkyFromAtmosphere = undefined;
    this._vaSky = undefined; // Reference to sky-from-space or sky-from-atmosphere
    this._spSky = undefined;
    this._rsSky = undefined;

    this._spDepth = undefined;
    this._vaDepth = undefined;
    this._rsDepth = undefined;

    this._quadH = undefined;
    this._quadV = undefined;

    this._fb = undefined;

    /**
     * DOC_TBA
     *
     * @type {Cartesian2}
     */
    this.logoOffset = Cartesian2.ZERO;

    this._logoOffset = this.logoOffset;
    this._imageLogo = undefined;
    this._quadLogo = undefined;

    this._dayTileProvider = undefined;
    this._nightImageSource = undefined;
    this._specularImageSource = undefined;
    this._cloudsImageSource = undefined;
    this._bumpImageSource = undefined;
    this._nightTexture = undefined;
    this._specularTexture = undefined;
    this._cloudsTexture = undefined;
    this._bumpTexture = undefined;
    this._showDay = false;
    this._showNight = false;
    this._showClouds = false;
    this._showCloudShadows = false;
    this._showSpecular = false;
    this._showBumps = false;
    this._showTerminator = false;

    this._minTileDistance = undefined;

    /**
     * DOC_TBA
     *
     * @type {Number}
     */
    this.pixelError3D = 5.0;

    /**
     * DOC_TBA
     *
     * @type {Number}
     */
    this.pixelError2D = 2.0;

    /**
     * Determines if the central body will be shown.
     *
     * @type {Boolean}
     */
    this.show = true;

    /**
     * DOC_TBA
     *
     * @type {Boolean}
     */
    this.showGroundAtmosphere = false;

    /**
     * DOC_TBA
     *
     * @type {Boolean}
     */
    this.showSkyAtmosphere = false;

    /**
     * DOC_TBA
     */
    this.dayTileProvider = undefined;

    /**
     * The URL of the image to use as a night texture.  An asynchronous
     * request is made for the image at the next call to {@link CentralBody#update}.
     * The night texture is shown once the image is loaded and {@link CentralBody#showNight}
     * is <code>true</code>.
     * <br /><br />
     * Example day image:
     * <div align="center">
     * <img src="../images/CentralBody.nightImageSource.jpg" width="512" height="256" />
     * <a href="http://visibleearth.nasa.gov/view_rec.php?id=1438">NASA Visible Earth</a>.
     * Data courtesy Marc Imhoff of NASA GSFC and Christopher Elvidge of
     * NOAA NGDC. Image by Craig Mayhew and Robert Simmon, NASA GSFC.
     * </div>
     *
     * @type {String}
     *
     * @see CentralBody#showNight
     */
    this.nightImageSource = undefined;

    /**
     * The URL of the image to use as a specular map; a single-channel image where zero indicates
     * land cover, and 255 indicates water.  An asynchronous request is made for the image
     * at the next call to {@link CentralBody#update}. The specular map is used once the
     * image is loaded and {@link CentralBody#showSpecular} is <code>true</code>.
     * <br /><br />
     * Example specular map:
     * <div align="center">
     * <img src="../images/CentralBody.specularMapSource.jpg" width="512" height="256" />
     * <a href="http://planetpixelemporium.com/earth.html">Planet Texture Maps</a>
     * </div>
     *
     * @type {String}
     *
     * @see CentralBody#showSpecular
     */
    this.specularImageSource = undefined;

    /**
     * The URL of the image to use as a cloud map; a single-channel image where 255 indicates
     * cloud cover, and zero indicates no clouds.  An asynchronous request is made for the image
     * at the next call to {@link CentralBody#update}. The cloud map is shown once the
     * image is loaded and {@link CentralBody#showClouds} is <code>true</code>.
     * <br /><br />
     * Example cloud map:
     * <div align="center">
     * <img src="../images/CentralBody.cloudsMapSource.jpg" width="512" height="256" />
     * <a href="http://planetpixelemporium.com/earth.html">Planet Texture Maps</a>
     * </div>
     *
     * @type {String}
     *
     * @see CentralBody#showClouds
     */
    this.cloudsImageSource = undefined;

    /**
     * The URL of the image to use as a bump map; a single-channel image where zero indicates
     * sea level, and 255 indicates maximum height.  An asynchronous request is made for the image
     * at the next call to {@link CentralBody#update}. The bump map is used once the
     * image is loaded and {@link CentralBody#showBumps} is <code>true</code>.
     * <br /><br />
     * Example bump map:
     * <div align="center">
     * <img src="../images/CentralBody.bumpMapSource.jpg" width="512" height="256" />
     * <a href="http://planetpixelemporium.com/earth.html">Planet Texture Maps</a>
     * </div>
     *
     * @type {String}
     *
     * @see CentralBody#showBumps
     */
    this.bumpImageSource = undefined;

    /**
     * When <code>true</code>, textures from the <code>dayProvider</code> are shown on the central body.
     * <br /><br />
     * <div align="center">
     * <img src="../images/CentralBody.showDay.jpg" width="400" height="300" />
     * </div>
     *
     * @type {Boolean}
     *
     * @see CentralBody#dayProvider
     * @see CentralBody#showNight
     */
    this.showDay = true;

    /**
     * When <code>true</code>, the night texture is shown on the side of the central body not illuminated by the sun.
     * The day and night textures are blended across the terminator using {@link CentralBody#dayNightBlendDelta}.
     * When <code>false</code>, the day textures are shown on the entire globe (if enabled).
     * <div align="center">
     * <img src="../images/CentralBody.showNight.jpg" width="400" height="300" />
     * </div>
     *
     * @type {Boolean}
     *
     * @see CentralBody#nightImageSource
     * @see CentralBody#showDay
     * @see CentralBody#dayNightBlendDelta
     *
     * @example
     * cb.showNight = true;
     * cb.nightImageSource = "night.jpg";
     */
    this.showNight = true;

    /**
     * When <code>true</code>, diffuse-lit clouds are shown on the central body.  When {@link CentralBody#showNight}
     * is also true, clouds on the dark side of the globe will fully or partially occlude the night texture.
     * <div align="center">
     * <img src="../images/CentralBody.showClouds.jpg" width="400" height="300" />
     * </div>
     *
     * @type {Boolean}
     *
     * @see CentralBody#cloudsMapSource
     * @see CentralBody#showCloudShadows
     * @see CentralBody#showNight
     *
     * @example
     * cb.showClouds = true;
     * cb.cloudsMapSource = "clouds.jpg";
     */
    this.showClouds = true;

    /**
     * When <code>true</code>, clouds on the daytime side of the globe cast approximate shadows.  The
     * shadows can be shown with or without the clouds themselves, which are controlled with
     * {@link CentralBody#showClouds}.
     * <div align="center">
     * <table border="0" cellpadding="5"><tr>
     * <td align="center"><code>true</code><br/><img src="../images/CentralBody.showCloudShadows.true.jpg" width="250" height="188" /></td>
     * <td align="center"><code>false</code><br/><img src="../images/CentralBody.showCloudShadows.false.jpg" width="250" height="188" /></td>
     * </tr></table>
     * </div>
     *
     * @type {Boolean}
     *
     * @see CentralBody#cloudsMapSource
     * @see CentralBody#showClouds
     *
     * @example
     * cb.showClouds = true;
     * cb.showCloudShadows = true;
     * cb.cloudsMapSource = "clouds.jpg";
     */
    this.showCloudShadows = true;

    /**
     * When <code>true</code>, a specular map (also called a gloss map) is used so only the ocean receives specular light.
     * <div align="center">
     * <table border="0" cellpadding="5"><tr>
     * <td align="center"><code>true</code><br/><img src="../images/CentralBody.showSpecular.true.jpg" width="250" height="188" /></td>
     * <td align="center"><code>false</code><br/><img src="../images/CentralBody.showSpecular.false.jpg" width="250" height="188" /></td>
     * </tr></table>
     * </div>
     *
     * @type {Boolean}
     *
     * @see CentralBody#specularMapSource
     *
     * @example
     * cb.showSpecular = true;
     * cb.specularMapSource = "specular.jpg";
     */
    this.showSpecular = true;

    /**
     * When <code>true</code>, a bump map is used to add lighting detail to the mountainous areas of the central body.
     * This gives the appearance of extra geometric complexity even though the central body is still a smooth ellipsoid.
     * The apparent steepness of the mountains is controlled by {@link CentralBody#bumpMapNormalZ}.
     * <div align="center">
     * <table border="0" cellpadding="5"><tr>
     * <td align="center"><code>true</code><br/><img src="../images/CentralBody.showBumps.true.jpg" width="250" height="188" /></td>
     * <td align="center"><code>false</code><br/><img src="../images/CentralBody.showBumps.false.jpg" width="250" height="188" /></td>
     * </tr></table>
     * </div>
     *
     * @type {Boolean}
     *
     * @see CentralBody#bumpMapSource
     * @see CentralBody#bumpMapNormalZ
     *
     * @example
     * cb.showBumps = true;
     * cb.bumpMapSource = "bump.jpg";
     */
    this.showBumps = true;

    /**
     * When <code>true</code>, shows a line on the central body where day meets night.
     * <div align="center">
     * <img src="../images/CentralBody.showTerminator.jpg" width="400" height="300" />
     * </div>
     *
     * @type {Boolean}
     *
     * @see CentralBody#showNight
     * @see CentralBody#dayNightBlendDelta
     */
    this.showTerminator = false;

    /**
     * When {@link CentralBody#showBumps} is <code>true</code>, <code>bumpMapNormalZ</code> controls the
     * apparent steepness of the mountains.  A value less than one over-exaggerates the steepness; a value greater
     * than one under-exaggerates, making mountains less noticeable.
     * <div align="center">
     * <table border="0" cellpadding="5"><tr>
     * <td align="center"><code>0.25</code><br/><img src="../images/Centralbody.bumpMapNormalZ.025.jpg" width="250" height="188" /></td>
     * <td align="center"><code>1.25</code><br/><img src="../images/Centralbody.bumpMapNormalZ.125.jpg" width="250" height="188" /></td>
     * </tr></table>
     * </div>
     *
     * @type {Number}
     *
     * @see CentralBody#showBumps
     *
     * @example
     * cb.showBumps = true;
     * cb.bumpMapSource = "bump.jpg";
     * cb.bumpMapNormalZ = 1.0;
     */
    this.bumpMapNormalZ = 0.5;

    /**
     * When {@link CentralBody#showDay} and {@link CentralBody#showNight} are both <code>true</code>,
     * <code>dayNightBlendDelta</code> determines the size of the blend region surrounding the terminator (where day
     * meets night).  A value of zero indicates a sharp transition without blending; a larger value creates a linearly
     * blended region based on the diffuse lighting component:  <code>-dayNightBlendDelta &lt; diffuse &lt; dayNightBlendDelta</code>.
     * <div align="center">
     * <table border="0" cellpadding="5"><tr>
     * <td align="center"><code>0.0</code><br/><img src="../images/Centralbody.dayNightBlendDelta.0.jpg" width="250" height="188" /></td>
     * <td align="center"><code>0.05</code><br/><img src="../images/Centralbody.dayNightBlendDelta.05.jpg" width="250" height="188" /></td>
     * </tr></table>
     * </div>
     *
     * @type {Number}
     *
     * @see CentralBody#showDay
     * @see CentralBody#showNight
     * @see CentralBody#showTerminator
     *
     * @example
     * cb.showDay = true;
     * cb.dayImageSource = "day.jpg";
     * cb.showNight = true;
     * cb.nightImageSource = "night.jpg";
     * cb.dayNightBlendDelta = 0.0;  // Sharp transition
     */
    this.dayNightBlendDelta = 0.05;

    /**
     * DOC_TBA
     *
     * @type {Number}
     */
    this.nightIntensity = 2.0;

    /**
     * DOC_TBA
     *
     * @type {Number}
     */
    this.morphTime = 1.0;

    this._mode = SceneMode.SCENE3D;
    this._projection = undefined;

    this._fCameraHeight = undefined;
    this._fCameraHeight2 = undefined;
    this._outerRadius = ellipsoid.getRadii().multiplyWithScalar(1.025).getMaximumComponent();

    // TODO: Do we want to expose any of these atmosphere constants?
    var Kr = 0.0025;
    var Kr4PI = Kr * 4.0 * Math.PI;
    var Km = 0.0015;
    var Km4PI = Km * 4.0 * Math.PI;
    var ESun = 15.0;
    var g = -0.95;
    var innerRadius = ellipsoid.getRadii().getMaximumComponent();
    var rayleighScaleDepth = 0.25;
    var inverseWaveLength = {
        x : 1.0 / Math.pow(0.650, 4.0), // Red
        y : 1.0 / Math.pow(0.570, 4.0), // Green
        z : 1.0 / Math.pow(0.475, 4.0) // Blue
    };

    this._minGroundFromAtmosphereHeight = 6378500.0; // from experimentation / where shader fails due to precision errors
    this._startFadeGroundFromAtmosphere = this._minGroundFromAtmosphereHeight + 1000;

    var that = this;

    var atmosphereUniforms = {
        v3InvWavelength : function() {
            return inverseWaveLength;
        },
        fCameraHeight : function() {
            return that._fCameraHeight;
        },
        fCameraHeight2 : function() {
            return that._fCameraHeight2;
        },
        fOuterRadius : function() {
            return that._outerRadius;
        },
        fOuterRadius2 : function() {
            return that._outerRadius * that._outerRadius;
        },
        fInnerRadius : function() {
            return innerRadius;
        },
        fInnerRadius2 : function() {
            return innerRadius * innerRadius;
        },
        fKrESun : function() {
            return Kr * ESun;
        },
        fKmESun : function() {
            return Km * ESun;
        },
        fKr4PI : function() {
            return Kr4PI;
        },
        fKm4PI : function() {
            return Km4PI;
        },
        fScale : function() {
            return 1.0 / (that._outerRadius - innerRadius);
        },
        fScaleDepth : function() {
            return rayleighScaleDepth;
        },
        fScaleOverScaleDepth : function() {
            return (1.0 / (that._outerRadius - innerRadius)) / rayleighScaleDepth;
        },
        g : function() {
            return g;
        },
        g2 : function() {
            return g * g;
        },
        fMinGroundFromAtmosphereHeight : function() {
            return that._minGroundFromAtmosphereHeight;
        },
        fstartFadeGroundFromAtmosphere : function() {
            return that._startFadeGroundFromAtmosphere;
        }
    };

    var uniforms = {
        u_nightTexture : function() {
            return that._nightTexture;
        },
        u_cloudMap : function() {
            return that._cloudsTexture;
        },
        u_specularMap : function() {
            return that._specularTexture;
        },
        u_bumpMap : function() {
            return that._bumpTexture;
        },
        u_bumpMapResoltuion : function() {
            return {
                x : 1.0 / that._bumpTexture.getWidth(),
                y : 1.0 / that._bumpTexture.getHeight()
            };
        },
        u_bumpMapNormalZ : function() {
            return that.bumpMapNormalZ;
        },
        u_dayNightBlendDelta : function() {
            return that.dayNightBlendDelta;
        },
        u_nightIntensity : function() {
            return that.nightIntensity;
        },
        u_morphTime : function() {
            return that.morphTime;
        }
    };

    // PERFORMANCE_IDEA:  Only combine these if showing the atmosphere.  Maybe this is too much of a micro-optimization.
    // http://jsperf.com/object-property-access-propcount
    this._drawUniforms = combine(uniforms, atmosphereUniforms);
}

/**
 * DOC_TBA
 *
 * @memberof CentralBody
 *
 * @return {Ellipsoid} DOC_TBA
 */
CentralBody.prototype.getEllipsoid = function() {
    return this._ellipsoid;
};

CentralBody._isModeTransition = function(oldMode, newMode) {
    // SCENE2D, COLUMBUS_VIEW, and MORPHING use the same rendering path, so a
    // transition only occurs when switching from/to SCENE3D
    return ((oldMode !== newMode) &&
            ((oldMode === SceneMode.SCENE3D) ||
             (newMode === SceneMode.SCENE3D)));
};

CentralBody.prototype._syncMorphTime = function(mode) {
    switch (mode) {
    case SceneMode.SCENE3D:
        this.morphTime = 1.0;
        break;

    case SceneMode.SCENE2D:
    case SceneMode.COLUMBUS_VIEW:
        this.morphTime = 0.0;
        break;

    // MORPHING - don't change it
    }
};

CentralBody.prototype._prefetchImages = function() {
    var limit = Math.max(Math.min(this._prefetchLimit, this._dayTileProvider.zoomMax), this._dayTileProvider.zoomMin);
    var stack = [this._rootTile];
    while (stack.length !== 0) {
        var tile = stack.pop();

        if (tile.zoom < limit) {
            this._processTile(tile);
            stack = stack.concat(tile.getChildren());
        } else if (tile.zoom === limit) {
            this._processTile(tile);
        }
    }
};

CentralBody.prototype._createTextureCache = function(context) {
    if (this._dayTileProvider &&
        typeof this._dayTileProvider.tileWidth !== "undefined" &&
        typeof this._dayTileProvider.tileHeight !== "undefined") {
        this._texturePool = new Texture2DPool(this._dayTileProvider.tileWidth, this._dayTileProvider.tileHeight);
    } else {
        this._texturePool = undefined;
    }

    var pool = this._texturePool;

    var fetch = function(tile) {
        var texture;

        var width = parseInt(tile.image.width, 10);
        var height = parseInt(tile.image.height, 10);
        var usePool = pool && (width === pool.getWidth() && height === pool.getHeight());
        var inPool = false;

        if (usePool && pool.hasAvailable()) {
            texture = pool.getTexture();
            inPool = true;
        } else {
            texture = context.createTexture2D({
                width : width,
                height : height,
                pixelFormat : PixelFormat.RGB
            });
        }

        if (usePool && !inPool) {
            pool.add(texture);
        }
        return texture;
    };

    var remove = function(tile) {
        var width = tile.texture.getWidth();
        var height = tile.texture.getHeight();
        var usePool = (width === pool.getWidth() && height === pool.getHeight());

        if (usePool) {
            pool.remove(tile.texture);
            tile.texture = undefined;
        } else {
            tile.texture = tile.texture && tile.texture.destroy();
        }

        tile._extentVA = tile._extentVA && tile._extentVA.destroy();
        tile.projection = undefined;
        tile.state = TileState.READY;
    };

    var policy = new TileTextureCachePolicy({
        fetchFunc : fetch,
        removeFunc : remove,
        limit : this._textureCacheLimit
    });
    this._textureCache = new Cache(policy);
};

CentralBody.prototype._fetchImage = function(tile) {
    var that = this;
    var onload = function() {
        tile.state = TileState.IMAGE_LOADED;
    };
    var onerror = function() {
        tile._failCount = (tile._failCount) ? tile._failCount + 1 : 1;
        ++that._tileFailCount;
        that._lastFailedTime = new JulianDate();
        tile.state = TileState.IMAGE_FAILED;
    };
    var oninvalid = function() {
        tile.state = TileState.IMAGE_INVALID;
    };
    return this._dayTileProvider.loadTileImage(tile, onload, onerror, oninvalid);
};

CentralBody.prototype._getTileBoundingSphere = function (tile, state) {
    var boundingVolume;
    if (state.mode === SceneMode.SCENE3D) {
        boundingVolume = tile.get3DBoundingSphere().clone();
    } else if (state.mode === SceneMode.COLUMBUS_VIEW){
        boundingVolume = tile.get2DBoundingSphere(state.projection).clone();
        boundingVolume.center = new Cartesian3(0.0, boundingVolume.center.x, boundingVolume.center.y);
    } else {
        boundingVolume = tile.computeMorphBounds(this.morphTime, state.projection);
    }
    return boundingVolume;
};

CentralBody.prototype._cull = function(tile, state) {
    if (state.mode === SceneMode.SCENE2D) {
        var bRect = tile.get2DBoundingRectangle(state.projection);

        var frustum = this._camera.frustum;
        var position = this._camera.position;
        var x = position.x + frustum.left;
        var y = position.y + frustum.bottom;
        var w = position.x + frustum.right - x;
        var h = position.y + frustum.top - y;
        var fRect = new Rectangle(x, y, w, h);

        return !Rectangle.rectangleRectangleIntersect(bRect, fRect);
    }

    var boundingVolume = this._getTileBoundingSphere(tile, state);
    if (this._camera.getVisibility(boundingVolume, BoundingSphere.planeSphereIntersect) === Intersect.OUTSIDE) {
        return true;
    }

    if (state.mode === SceneMode.SCENE3D) {
        var occludeePoint = tile.getOccludeePoint();
        // console.log('occludeePoint:', occludeePoint);
        return (occludeePoint && !state.occluder.isVisible(new BoundingSphere(occludeePoint, 0.0))) || !state.occluder.isVisible(boundingVolume);
    }

    return false;
};

CentralBody.prototype._throttleImages = function(state) {
    for ( var i = 0, len = this._imageQueue.length; i < len && i < this._imageThrottleLimit; ++i) {
        var tile = this._imageQueue.dequeue();

        if (this._cull(tile, state)) {
            tile.state = TileState.READY;
            continue;
        }

        if (this._dayTileProvider.zoomMin !== 0 && tile.zoom === 0 && tile.x === 0 && tile.y === 0) {
            tile.image = this._createBaseTile();
            tile.projection = Projections.WGS84; // no need to re-project
            tile.state = TileState.IMAGE_LOADED;
        } else {
            tile.image = this._fetchImage(tile);
            if (!tile.projection) {
                tile.projection = this._dayTileProvider.projection;
            }
        }
    }
};

CentralBody.prototype._createBaseTile = function() {
    // Some tile servers, like Bing, don't have a base image for the entire central body.
    // Create a 1x1 image that will never get rendered.
    var canvas = document.createElement("canvas");
    canvas.width = 1.0;
    canvas.height = 1.0;

    return canvas;
};

CentralBody.prototype._throttleReprojection = function(state) {
    for ( var i = 0, len = this._reprojectQueue.length; i < len && i < this._reprojectThrottleLimit; ++i) {
        var tile = this._reprojectQueue.dequeue();

        if (this._cull(tile, state)) {
            tile.image = undefined;
            tile.state = TileState.READY;
            continue;
        }

        tile.image = tile.projection.toWgs84(tile.extent, tile.image);
        tile.state = TileState.REPROJECTED;
        tile.projection = Projections.WGS84;
    }
};

CentralBody.prototype._throttleTextures = function(state) {
    for ( var i = 0, len = this._textureQueue.length; i < len && i < this._textureThrottleLimit; ++i) {
        var tile = this._textureQueue.dequeue();

        if (this._cull(tile, state) || !tile.image) {
            tile.image = undefined;
            tile.state = TileState.READY;
            continue;
        }

        tile.texture = this._textureCache.find(tile);
        tile.texture.copyFrom(tile.image);
        tile.texture.generateMipmap(MipmapHint.NICEST);
        tile.texture.setSampler({
            wrapS : TextureWrap.CLAMP,
            wrapT : TextureWrap.CLAMP,
            minificationFilter : TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
            magnificationFilter : TextureMagnificationFilter.LINEAR,
            maximumAnisotropy : state.context.getMaximumTextureFilterAnisotropy() || 8 // TODO: Remove Chrome work around
        });
        tile.state = TileState.TEXTURE_LOADED;
        tile.image = undefined;
    }
};

CentralBody.prototype._processTile = function(tile) {
    if (this._imageQueue.contains(tile) || this._reprojectQueue.contains(tile) || this._textureQueue.contains(tile)) {
        return;
    }

    var maxFailed = this._tileFailCount > this._maxTileFailCount;
    var requestFailed = tile.state === TileState.IMAGE_FAILED && tile._failCount < this._maxTileFailCount;
    var maxTimePassed = this._lastFailedTime && this._lastFailedTime.getSecondsDifference(new JulianDate()) >= this.failedTileRetryTime;
    var retry = maxTimePassed || (requestFailed && !maxFailed);

    // check if tile needs to load image
    if (!tile.state || tile.state === TileState.READY) {
        this._imageQueue.enqueue(tile);
        tile.state = TileState.IMAGE_LOADING;
    } else if (tile.state === TileState.IMAGE_LOADED) {
        // or re-project the image
        this._reprojectQueue.enqueue(tile);
        tile.state = TileState.REPROJECTING;
    } else if (tile.state === TileState.REPROJECTED) {
        // or copy to a texture
        this._textureQueue.enqueue(tile);
        tile.state = TileState.TEXTURE_LOADING;
    } else if (retry) {
        // or retry a failed image
        if (maxTimePassed) {
            tile._failCount = 0;
            this._tileFailCount = 0;
        }
        this._imageQueue.enqueue(tile);
        tile.state = TileState.IMAGE_LOADING;
    } else if (tile.state === TileState.IMAGE_INVALID && tile.image) {
        // or release invalid image if there is one
        tile.image = undefined;
    }
};

CentralBody.prototype._enqueueTile = function(tile, state) {
    if (this._renderQueue.contains(tile)) {
        return;
    }

    var mode = state.mode;
    var projection = state.projection;
    var context = state.context;

    // create vertex array the first time it is needed or when morphing
    if (!tile._extentVA ||
        tile._extentVA.isDestroyed() ||
        CentralBody._isModeTransition(this._mode, mode) ||
        tile._mode !== mode ||
        this._projection !== projection) {
        tile._extentVA = tile._extentVA && tile._extentVA.destroy();

        var ellipsoid = this._ellipsoid;
        var rtc = tile.get3DBoundingSphere().center;
        var projectedRTC = tile.get2DBoundingSphere(projection).center.clone();

        var gran = (tile.zoom > 0) ? 0.05 * (1.0 / tile.zoom * 2.0) : 0.05; // seems like a good value after testing it for what looks good
        // console.log('gran:', gran);
        var typedArray;
        var buffer;
        var stride;
        var attributes;
        var indexBuffer;
        var datatype = ComponentDatatype.FLOAT;
        var usage = BufferUsage.STATIC_DRAW;

        if (mode === SceneMode.SCENE3D) {
            var buffers = ExtentTessellator.computeBuffers({
                ellipsoid : ellipsoid,
                extent : tile.extent,
                granularity : gran,
                generateTextureCoords : true,
                interleave : true,
                relativeToCenter : rtc
            });

            typedArray = datatype.toTypedArray(buffers.vertices);
            buffer = context.createVertexBuffer(typedArray, usage);
            stride = 5 * datatype.sizeInBytes;
            attributes = [{
                index : attributeIndices.position3D,
                vertexBuffer : buffer,
                componentDatatype : datatype,
                componentsPerAttribute : 3,
                offsetInBytes : 0,
                strideInBytes : stride
            }, {
                index : attributeIndices.textureCoordinates,
                vertexBuffer : buffer,
                componentDatatype : datatype,
                componentsPerAttribute : 2,
                offsetInBytes : 3 * datatype.sizeInBytes,
                strideInBytes : stride
            }, {
                index : attributeIndices.position2D,
                value : [0.0, 0.0]
            }];
            indexBuffer = context.createIndexBuffer(new Uint16Array(buffers.indices), usage, IndexDatatype.UNSIGNED_SHORT);
        } else {
            var vertices = [];
            var width = tile.extent.east - tile.extent.west;
            var height = tile.extent.north - tile.extent.south;
            var lonScalar = 1.0 / width;
            var latScalar = 1.0 / height;

            var mesh = PlaneTessellator.compute({
                resolution : {
                    x : Math.max(Math.ceil(width / gran), 2.0),
                    y : Math.max(Math.ceil(height / gran), 2.0)
                },
                onInterpolation : function(time) {
                    var lonLat = new Cartographic2(
                            CesiumMath.lerp(tile.extent.west, tile.extent.east, time.x),
                            CesiumMath.lerp(tile.extent.south, tile.extent.north, time.y));

                    var p = ellipsoid.toCartesian(lonLat).subtract(rtc);
                    vertices.push(p.x, p.y, p.z);

                    var u = (lonLat.longitude - tile.extent.west) * lonScalar;
                    var v = (lonLat.latitude - tile.extent.south) * latScalar;
                    vertices.push(u, v);

                    // TODO: This will not work if the projection's ellipsoid is different
                    // than the central body's ellipsoid.  Throw an exception?
                    var projectedLonLat = projection.project(lonLat).subtract(projectedRTC);
                    vertices.push(projectedLonLat.x, projectedLonLat.y);
                }
            });

            typedArray = datatype.toTypedArray(vertices);
            buffer = context.createVertexBuffer(typedArray, usage);
            stride = 7 * datatype.sizeInBytes;
            attributes = [{
                index : attributeIndices.position3D,
                vertexBuffer : buffer,
                componentDatatype : datatype,
                componentsPerAttribute : 3,
                offsetInBytes : 0,
                strideInBytes : stride
            }, {
                index : attributeIndices.textureCoordinates,
                vertexBuffer : buffer,
                componentDatatype : datatype,
                componentsPerAttribute : 2,
                offsetInBytes : 3 * datatype.sizeInBytes,
                strideInBytes : stride
            }, {
                index : attributeIndices.position2D,
                vertexBuffer : buffer,
                componentDatatype : datatype,
                componentsPerAttribute : 2,
                offsetInBytes : 5 * datatype.sizeInBytes,
                strideInBytes : stride
            }];

            indexBuffer = context.createIndexBuffer(new Uint16Array(mesh.indexLists[0].values), usage, IndexDatatype.UNSIGNED_SHORT);
        }

        tile._extentVA = context.createVertexArray(attributes, indexBuffer);

        var intensity = (this._dayTileProvider && this._dayTileProvider.getIntensity && this._dayTileProvider.getIntensity(tile)) || 0.0;
        var drawUniforms = {
            u_dayTexture : function() {
                return tile.texture;
            },
            u_center3D : function() {
                return rtc;
            },
            u_center2D : function() {
                return (projectedRTC) ? projectedRTC.getXY() : Cartesian2.ZERO;
            },
            u_modifiedModelView : function() {
                return tile.modelView;
            },
            u_dayIntensity : function() {
                return intensity;
            },
            u_mode : function() {
                return tile.mode;
            }
        };
        tile._drawUniforms = combine(drawUniforms, this._drawUniforms);

        tile._mode = mode;
    }
    this._renderQueue.enqueue(tile);
};

CentralBody.prototype._createTileDistanceFunction = function(width, height) {
    var frustum = this._camera.frustum;
    var provider = this._dayTileProvider;
    var extent = provider.maxExtent;

    var pixelSizePerDistance = 2.0 * Math.tan(frustum.fovy * 0.5);
    if (height > width * frustum.aspectRatio) {
        pixelSizePerDistance /= height;
    } else {
        pixelSizePerDistance /= width;
    }

    var invPixelSizePerDistance = 1.0 / pixelSizePerDistance;
    var texelHeight = (extent.north - extent.south) / provider.tileHeight;
    var texelWidth = (extent.east - extent.west) / provider.tileWidth;
    var texelSize = (texelWidth > texelHeight) ? texelWidth : texelHeight;
    var dmin = texelSize * invPixelSizePerDistance;
    dmin *= this._ellipsoid.getMaximumRadius();

    return function(zoom, pixelError) {
        return (dmin / pixelError) * Math.exp(-0.693147181 * zoom);
    };
};

CentralBody.prototype._refine3D = function(tile, state) {
    var provider = this._dayTileProvider;
    if (typeof provider === "undefined") {
        return false;
    }

    if (tile.zoom < provider.zoomMin) {
        return true;
    }

    var boundingVolume = this._getTileBoundingSphere(tile, state);
    var cameraPosition = state.camera.position;
    var direction = state.camera.direction;

    var texturePixelError = (this.pixelError3D !== "undefined" && this.pixelError3D > 0.0) ? this.pixelError3D : 1.0;
    var dmin = this._minTileDistance(tile.zoom, texturePixelError);

    var toCenter = boundingVolume.center.subtract(cameraPosition);
    var toSphere = toCenter.normalize().multiplyWithScalar(toCenter.magnitude() - boundingVolume.radius);
    var distance = direction.multiplyWithScalar(direction.dot(toSphere)).magnitude();

    if (distance > 0.0 && distance < dmin) {
        return true;
    }

    return false;
};

CentralBody.prototype._refine2D = function(tile, state) {
    var camera = this._camera;
    var frustum = camera.frustum;
    var pixelError = this.pixelError2D;
    var provider = this._dayTileProvider;

    var projection = state.projection;
    var viewport = state.context.getViewport();
    var viewportWidth = viewport.width;
    var viewportHeight = viewport.height;

    if (typeof provider === "undefined") {
        return false;
    }

    if (tile.zoom < provider.zoomMin) {
        return true;
    }

    var texturePixelError = (pixelError > 0.0) ? pixelError : 1.0;

    var tileWidth, tileHeight;
    if (tile.texture && !tile.texture.isDestroyed()) {
        tileWidth = tile.texture.getWidth();
        tileHeight = tile.texture.getHeight();
    } else if (tile.image && typeof tile.image.width !== "undefined") {
        tileWidth = tile.image.width;
        tileHeight = tile.image.height;
    } else {
        tileWidth = provider.tileWidth;
        tileHeight = provider.tileHeight;
    }

    var a = projection.project(new Cartographic2(tile.extent.west, tile.extent.north)).getXY();
    var b = projection.project(new Cartographic2(tile.extent.east, tile.extent.south)).getXY();
    var diagonal = a.subtract(b);
    var texelSize = Math.max(diagonal.x, diagonal.y) / Math.max(tileWidth, tileHeight);
    var pixelSize = Math.max(frustum.top - frustum.bottom, frustum.right - frustum.left) / Math.max(viewportWidth, viewportHeight);

    if (texelSize > pixelSize * texturePixelError) {
        return true;
    }

    return false;
};

/**
 * Determines whether a tile should be refined to a higher resolution.
 *
 * @memberof CentralBody
 *
 * @return {Boolean} <code>true</code> if a higher resolution tile should be displayed or <code>false</code> if a higher resolution tile is not needed.
 */
CentralBody.prototype.refine = function(tile, state) {
    if (state.mode === SceneMode.SCENE2D) {
        return this._refine2D(tile, state);
    }

    return this._refine3D(tile, state);
};

CentralBody.prototype._createScissorRectangle = function(description) {
    var quad = description.quad;
    var upperLeft = new Cartesian3(quad[0], quad[1], quad[2]);
    var lowerRight = new Cartesian3(quad[9], quad[10], quad[11]);
    var mvp = description.modelViewProjection;
    var clip = description.viewportTransformation;

    var center = upperLeft.add(lowerRight).multiplyWithScalar(0.5);
    var centerScreen = mvp.multiplyWithVector(new Cartesian4(center.x, center.y, center.z, 1.0));
    centerScreen = centerScreen.multiplyWithScalar(1.0 / centerScreen.w);
    var centerClip = clip.multiplyWithVector(centerScreen).getXYZ();

    var surfaceScreen = mvp.multiplyWithVector(new Cartesian4(upperLeft.x, upperLeft.y, upperLeft.z, 1.0));
    surfaceScreen = surfaceScreen.multiplyWithScalar(1.0 / surfaceScreen.w);
    var surfaceClip = clip.multiplyWithVector(surfaceScreen).getXYZ();

    var radius = Math.ceil(surfaceClip.subtract(centerClip).magnitude());
    var diameter = 2.0 * radius;

    return {
        x : Math.floor(centerClip.x) - radius,
        y : Math.floor(centerClip.y) - radius,
        width : diameter,
        height : diameter
    };
};

CentralBody.prototype._computeDepthQuad = function() {
    // PERFORMANCE_TODO: optimize diagonal matrix multiplies.
    var dInverse = Matrix3.createNonUniformScale(this._ellipsoid.getRadii());
    var d = Matrix3.createNonUniformScale(this._ellipsoid.getOneOverRadii());

    // TODO: Stop transforming camera position to world coordinates all the time.
    var p = this._camera.position;
    p = new Cartesian4(p.x, p.y, p.z, 1.0);
    p = this._camera.transform.multiplyWithVector(p).getXYZ();

    // Find the corresponding position in the scaled space of the ellipsoid.
    var q = d.multiplyWithVector(p);

    var qMagnitude = q.magnitude();
    var qUnit = q.normalize();

    // Determine the east and north directions at q.
    var eUnit = Cartesian3.UNIT_Z.cross(q).normalize();
    var nUnit = qUnit.cross(eUnit).normalize();

    // Determine the radius of the "limb" of the ellipsoid.
    var wMagnitude = Math.sqrt(q.magnitudeSquared() - 1.0);

    // Compute the center and offsets.
    var center = qUnit.multiplyWithScalar(1.0 / qMagnitude);
    var scalar = wMagnitude / qMagnitude;
    var eastOffset = eUnit.multiplyWithScalar(scalar);
    var northOffset = nUnit.multiplyWithScalar(scalar);

    // A conservative measure for the longitudes would be to use the min/max longitudes of the bounding frustum.
    var upperLeft = dInverse.multiplyWithVector(center.add(northOffset).subtract(eastOffset));
    var upperRight = dInverse.multiplyWithVector(center.add(northOffset).add(eastOffset));
    var lowerLeft = dInverse.multiplyWithVector(center.subtract(northOffset).subtract(eastOffset));
    var lowerRight = dInverse.multiplyWithVector(center.subtract(northOffset).add(eastOffset));
    return [upperLeft.x, upperLeft.y, upperLeft.z, lowerLeft.x, lowerLeft.y, lowerLeft.z, upperRight.x, upperRight.y, upperRight.z, lowerRight.x, lowerRight.y, lowerRight.z];
};

/**
 * @private
 */
CentralBody.prototype.update = function(context, sceneState) {
    var width = context.getCanvas().clientWidth;
    var height = context.getCanvas().clientHeight;

    if (width === 0 || height === 0) {
        return;
    }

    var mode = sceneState.mode;
    var projection = sceneState.scene2D.projection;

    this._syncMorphTime(mode);

    if (this._dayTileProvider !== this.dayTileProvider) {
        this._dayTileProvider = this.dayTileProvider;

        // destroy logo
        this._quadLogo = this._quadLogo && this._quadLogo.destroy();

        // stop loading everything
        this._imageQueue.clear();
        this._textureQueue.clear();
        this._reprojectQueue.clear();

        // destroy tiles
        this._destroyTileTree();

        // destroy resources
        this._texturePool = this._texturePool && this._texturePool.destroy();
        this._textureCache = this._textureCache && this._textureCache.destroy();

        // create new tile tree
        this._rootTile = new Tile({
            extent : this._dayTileProvider.maxExtent || this._maxExtent,
            zoom : 0,
            ellipsoid : this._ellipsoid
        });

        this._prefetchImages();

        var viewport = context.getViewport();
        this._minTileDistance = this._createTileDistanceFunction(viewport.width, viewport.height);
    }

    var hasLogo = this._dayTileProvider && this._dayTileProvider.getLogo;
    var imageLogo =  (hasLogo) ? this._dayTileProvider.getLogo() : undefined;
    var createLogo = !this._quadLogo || this._quadLogo.isDestroyed();
    var updateLogo = createLogo || this._imageLogo !== imageLogo;
    if (updateLogo) {
        if (typeof imageLogo === 'undefined') {
            this._quadLogo = this._quadLogo && this._quadLogo.destroy();
        }
        else {
            this._quadLogo = new ViewportQuad(new Rectangle(this.logoOffset.x, this.logoOffset.y, imageLogo.width, imageLogo.height));
            this._quadLogo.setTexture(context.createTexture2D({
                source : imageLogo,
                pixelFormat : PixelFormat.RGBA
            }));
            this._quadLogo.enableBlending = true;
        }
        this._imageLogo = imageLogo;
    } else if (this._quadLogo && this._imageLogo && !this.logoOffset.equals(this._logoOffset)) {
        this._quadLogo.setRectangle(new Rectangle(this.logoOffset.x, this.logoOffset.y, this._imageLogo.width, this._imageLogo.height));
        this._logoOffset = this.logoOffset;
    }

    if (!this._textureCache || this._textureCache.isDestroyed()) {
        this._createTextureCache(context);
    }

    var createFBO = !this._fb || this._fb.isDestroyed();
    var fboDimensionsChanged = this._fb && (this._fb.getColorTexture().getWidth() !== width || this._fb.getColorTexture().getHeight() !== height);

    if (createFBO || fboDimensionsChanged ||
        (!this._quadV || this._quadV.isDestroyed()) ||
        (!this._quadH || this._quadH.isDestroyed())) {

        this._fb = this._fb && this._fb.destroy();
        this._quadV = this._quadV && this._quadV.destroy();
        this._quadH = this._quadH && this._quadH.destroy();

        // create FBO and texture render targets
        this._fb = context.createFramebuffer({
            colorTexture : context.createTexture2D({
                width : width,
                height : height,
                pixelFormat : PixelFormat.RGBA
            })
        });

        // create viewport quad for vertical gaussian blur pass
        this._quadV = new ViewportQuad(new Rectangle(0.0, 0.0, width, height));
        this._quadV.vertexShader = "#define VERTICAL 1\n" + CentralBodyVSFilter;
        this._quadV.fragmentShader = CentralBodyFSFilter;
        this._quadV.uniforms.u_height = function() {
            return height;
        };
        this._quadV.setTexture(this._fb.getColorTexture());
        this._quadV.setDestroyTexture(false);
        this._quadV.setFramebuffer(context.createFramebuffer({
            colorTexture : context.createTexture2D({
                width : width,
                height : height,
                pixelFormat : PixelFormat.RGBA
            })
        }));
        this._quadV.setDestroyFramebuffer(true);

        // create viewport quad for horizontal gaussian blur pass
        this._quadH = new ViewportQuad(new Rectangle(0.0, 0.0, width, height));
        this._quadH.vertexShader = CentralBodyVSFilter;
        this._quadH.fragmentShader = CentralBodyFSFilter;
        this._quadH.uniforms.u_width = function() {
            return width;
        };
        this._quadH.setTexture(this._quadV.getFramebuffer().getColorTexture());
        this._quadH.setDestroyTexture(false);
    }

    this._quadV.update(context, sceneState);
    this._quadH.update(context, sceneState);

    if (this._quadLogo && !this._quadLogo.isDestroyed()) {
        this._quadLogo.update(context, sceneState);
    }

    var vs, fs;

    if (this.showSkyAtmosphere && !this._vaSky) {
        // PERFORMANCE_IDEA:  Is 60 the right amount to tessellate?  I think scaling the original
        // geometry in a vertex is a bad idea; at least, because it introduces a draw call per tile.
        var skyMesh = CubeMapEllipsoidTessellator.compute(new Ellipsoid(this._ellipsoid.getRadii().multiplyWithScalar(1.025)), 60);
        this._vaSky = context.createVertexArrayFromMesh({
            mesh : skyMesh,
            attributeIndices : MeshFilters.createAttributeIndices(skyMesh),
            bufferUsage : BufferUsage.STATIC_DRAW
        });

        vs = "#define SKY_FROM_SPACE \n" +
             "#line 0 \n" +
             SkyAtmosphereVS;

        fs = "#line 0\n" +
             SkyAtmosphereFS;

        this._spSkyFromSpace = context.getShaderCache().getShaderProgram(vs, fs);

        vs = "#define SKY_FROM_ATMOSPHERE" +
             "#line 0 \n" +
             SkyAtmosphereVS;

        this._spSkyFromAtmosphere = context.getShaderCache().getShaderProgram(vs, fs);
        this._rsSky = context.createRenderState({
            cull : {
                enabled : true,
                face : CullFace.FRONT
            }
        // TODO: revisit when multi-frustum/depth test is ready
        /*depthTest : {
            enabled : true
        },
        depthMask : false*/
        });
    }

    if (CentralBody._isModeTransition(this._mode, mode) || this._projection !== projection) {
        if (mode === SceneMode.SCENE3D) {
            this._rsColor = context.createRenderState({ // Write color, not depth
                cull : {
                    enabled : true
                }
            });
            this._rsDepth = context.createRenderState({ // Write depth, not color
                cull : {
                    enabled : true
                },
                depthTest : {
                    enabled : true,
                    func : DepthFunction.ALWAYS
                },
                colorMask : {
                    red : false,
                    green : false,
                    blue : false,
                    alpha : false
                }
            });
        } else {
            this._rsColor = context.createRenderState();
            this._rsDepth = context.createRenderState();
        }
    }

    // TODO: Wait until multi-frustum
    //this._rsColor.depthTest.enabled = (mode === SceneMode.MORPHING);  // Depth test during morph
    var cull = (mode === SceneMode.SCENE3D) || (mode === SceneMode.MORPHING);
    this._rsColor.cull.enabled = cull;
    this._rsDepth.cull.enabled = cull;

    // update scisor/depth plane
    var depthQuad = this._computeDepthQuad();

    // TODO: re-enable scissorTest
    /*if (mode === SceneMode.SCENE3D) {
        var uniformState = context.getUniformState();
        var mvp = uniformState.getModelViewProjection();
        var scissorTest = {
            enabled : true,
            rectangle : this._createScissorRectangle({
                quad : depthQuad,
                modelViewProjection : mvp,
                viewportTransformation : uniformState.getViewportTransformation()
            })
        };

        this._rsColor.scissorTest = scissorTest;
        this._rsDepth.scissorTest = scissorTest;
        this._quadV.renderState.scissorTest = scissorTest;
        this._quadH.renderState.scissorTest = scissorTest;
    }*/

    // depth plane
    if (!this._vaDepth) {
        var mesh = {
            attributes : {
                position : {
                    componentDatatype : ComponentDatatype.FLOAT,
                    componentsPerAttribute : 3,
                    values : depthQuad
                }
            },
            indexLists : [{
                primitiveType : PrimitiveType.TRIANGLES,
                values : [0, 1, 2, 2, 1, 3]
            }]
        };
        this._vaDepth = context.createVertexArrayFromMesh({
            mesh : mesh,
            attributeIndices : {
                position : 0
            },
            bufferUsage : BufferUsage.DYNAMIC_DRAW
        });
    } else {
        var datatype = ComponentDatatype.FLOAT;
        this._vaDepth.getAttribute(0).vertexBuffer.copyFromArrayView(datatype.toTypedArray(depthQuad));
    }

    if (!this._spDepth) {
        this._spDepth = context.getShaderCache().getShaderProgram(
                CentralBodyVSDepth,
                "#line 0\n" +
                CentralBodyFSDepth, {
                    position : 0
                });
    }

    var that = this;

    // Throw exception if there was a problem asynchronously loading an image.
    if (this._exception) {
        var message = this._exception;
        this._exception = undefined;
        throw new RuntimeError(message);
    }

    // PERFORMANCE_IDEA:  Once a texture is created, it is not destroyed if
    // the corresponding show flag is turned off.  This will waste memory
    // if a user loads every texture, then sets all the flags to false.

    if (this._nightImageSource !== this.nightImageSource) {
        this._nightImageSource = this.nightImageSource;

        var nightImage = new Image();
        nightImage.onload = function() {
            that._nightTexture = that._nightTexture && that._nightTexture.destroy();
            that._nightTexture = context.createTexture2D({
                source : nightImage,
                pixelFormat : PixelFormat.RGB
            });
        };
        nightImage.onerror = function() {
            that._exception = "Could not load image: " + this.src + ".";
        };
        nightImage.src = this.nightImageSource;
    }

    if (this._specularMapSource !== this.specularMapSource) {
        this._specularMapSource = this.specularMapSource;

        var specularImage = new Image();
        specularImage.onload = function() {
            that._specularTexture = that._specularTexture && that._specularTexture.destroy();
            that._specularTexture = context.createTexture2D({
                source : specularImage,
                pixelFormat : PixelFormat.LUMINANCE
            });
        };
        specularImage.onerror = function() {
            that._exception = "Could not load image: " + this.src + ".";
        };
        specularImage.src = this.specularMapSource;
    }

    if (this._cloudsMapSource !== this.cloudsMapSource) {
        this._cloudsMapSource = this.cloudsMapSource;

        var cloudsImage = new Image();
        cloudsImage.onload = function() {
            that._cloudsTexture = that._cloudsTexture && that._cloudsTexture.destroy();
            that._cloudsTexture = context.createTexture2D({
                source : cloudsImage,
                pixelFormat : PixelFormat.LUMINANCE
            });
        };
        cloudsImage.onerror = function() {
            that._exception = "Could not load image: " + this.src + ".";
        };
        cloudsImage.src = this.cloudsMapSource;
    }

    if (this._bumpMapSource !== this.bumpMapSource) {
        this._bumpMapSource = this.bumpMapSource;

        var bumpImage = new Image();
        bumpImage.onload = function() {
            that._bumpTexture = that._bumpTexture && that._bumpTexture.destroy();
            that._bumpTexture = context.createTexture2D({
                source : bumpImage,
                pixelFormat : PixelFormat.LUMINANCE
            });
        };
        bumpImage.onerror = function() {
            that._exception = "Could not load image: " + this.src + ".";
        };
        bumpImage.src = this.bumpMapSource;
    }

    // Initial compile or re-compile if uber-shader parameters changed
    var dayChanged = ((this._showDay !== this.showDay) && (!this.showDay || this._dayTileProvider));
    var nightChanged = ((this._showNight !== this.showNight) && (!this.showNight || this._nightTexture));
    var cloudsChanged = ((this._showClouds !== this.showClouds) && (!this.showClouds || this._cloudsTexture));
    var cloudShadowsChanged = ((this._showCloudShadows !== this.showCloudShadows) && (!this.showCloudShadows || this._cloudsTexture));
    var specularChanged = ((this._showSpecular !== this.showSpecular) && (!this.showSpecular || this._specularTexture));
    var bumpsChanged = ((this._showBumps !== this.showBumps) && (!this.showBumps || this._bumpTexture));

    if (!this._sp ||
        (dayChanged || nightChanged || cloudsChanged || cloudShadowsChanged || specularChanged || bumpsChanged) ||
        (this._showTerminator !== this.showTerminator)) {

        vs = "#line 0\n" +
             CentralBodyVS;

        fs = ((this.showDay && this._dayTileProvider) ? "#define SHOW_DAY 1\n" : "") +
             ((this.showNight && this._nightTexture) ? "#define SHOW_NIGHT 1\n" : "") +
             ((this.showClouds && this._cloudsTexture) ? "#define SHOW_CLOUDS 1\n" : "") +
             ((this.showCloudShadows && this._cloudsTexture) ? "#define SHOW_CLOUD_SHADOWS 1\n" : "") +
             ((this.showSpecular && this._specularTexture) ? "#define SHOW_SPECULAR 1\n" : "") +
             ((this.showBumps && this._bumpTexture) ? "#define SHOW_BUMPS 1\n" : "") +
             (this.showTerminator ? "#define SHOW_TERMINATOR 1\n" : "") +
             "#line 0\n" +
             CentralBodyFS;

        this._spWithoutAtmosphere = this._spWithoutAtmosphere && this._spWithoutAtmosphere.release();
        this._spGroundFromSpace = this._spGroundFromSpace && this._spGroundFromSpace.release();
        this._spGroundFromAtmosphere = this._spGroundFromAtmosphere && this._spGroundFromAtmosphere.release();

        this._spWithoutAtmosphere = context.getShaderCache().getShaderProgram(vs, fs, attributeIndices);
        this._spGroundFromSpace = context.getShaderCache().getShaderProgram(
                "#define SHOW_GROUND_ATMOSPHERE 1\n" +
                "#define SHOW_GROUND_ATMOSPHERE_FROM_SPACE 1\n" +
                vs,
                "#define SHOW_GROUND_ATMOSPHERE 1\n" +
                "#define SHOW_GROUND_ATMOSPHERE_FROM_SPACE 1\n" +
                fs, attributeIndices);
        this._spGroundFromAtmosphere = context.getShaderCache().getShaderProgram(
                "#define SHOW_GROUND_ATMOSPHERE 1\n" +
                "#define SHOW_GROUND_ATMOSPHERE_FROM_ATMOSPHERE 1\n" +
                vs,
                "#define SHOW_GROUND_ATMOSPHERE 1\n" +
                "#define SHOW_GROUND_ATMOSPHERE_FROM_ATMOSPHERE 1\n" +
                fs, attributeIndices);

        // Sync to public state
        this._showDay = dayChanged ? this.showDay : this._showDay;
        this._showNight = nightChanged ? this.showNight : this._showNight;
        this._showClouds = cloudsChanged ? this.showClouds : this._showClouds;
        this._showCloudShadows = cloudShadowsChanged ? this.showCloudShadows : this._showCloudShadows;
        this._showSpecular = specularChanged ? this.showSpecular : this._showSpecular;
        this._showBumps = bumpsChanged ? this.showBumps : this._showBumps;
        this._showTerminator = this.showTerminator;
    }

    var camera = this._camera;
    var cameraPosition = camera.transform.multiplyWithVector(new Cartesian4(camera.position.x, camera.position.y, camera.position.z, 1.0)).getXYZ();
    var cameraDirection = camera.transform.multiplyWithVector(new Cartesian4(camera.direction.x, camera.direction.y, camera.direction.z, 0.0)).getXYZ();

    this._fCameraHeight2 = cameraPosition.magnitudeSquared();
    this._fCameraHeight = Math.sqrt(this._fCameraHeight2);

    if (this._fCameraHeight > this._outerRadius) {
        // Viewer in space
        this._spSky = this._spSkyFromSpace;
        this._sp = this.showGroundAtmosphere ? this._spGroundFromSpace : this._spWithoutAtmosphere;
    } else {
        // after the camera passes the minimum height, there is no ground atmosphere effect
        var showAtmosphere = this._ellipsoid.toCartographic3(cameraPosition).height >= this._minGroundFromAtmosphereHeight;
        if (this.showGroundAtmosphere && showAtmosphere) {
            this._sp = this._spGroundFromAtmosphere;
        } else {
            this._sp = this._spWithoutAtmosphere;
        }
        this._spSky = this._spSkyFromAtmosphere;
    }

    var state = {
            context : context,
            camera : {
                position : cameraPosition,
                direction : cameraDirection
            },
            occluder : new Occluder(new BoundingSphere(Cartesian3.ZERO, this._ellipsoid.getMinimumRadius()), cameraPosition),
            mode : mode,
            projection : projection
    };

    this._throttleImages(state);
    this._throttleReprojection(state);
    this._throttleTextures(state);

    var stack = [this._rootTile];
    while (stack.length !== 0) {
        // console.log('while')
        var tile = stack.pop();

        if (this._cull(tile, state)) {
            continue;
        }

        if (!this._dayTileProvider || (tile.state === TileState.TEXTURE_LOADED && tile.texture && !tile.texture.isDestroyed())) {
            if (tile.zoom + 1 > this._dayTileProvider.zoomMax || !this.refine(tile, state)) {
                this._enqueueTile(tile, state);
            } else {
                var children = tile.getChildren();
                for (var i = 0; i < children.length; ++i) {
                    var child = children[i];
                    if ((child.state === TileState.TEXTURE_LOADED && child.texture && !child.texture.isDestroyed())) {
                        stack.push(child);
                    } else {
                        this._enqueueTile(tile, state);
                        this._processTile(child);
                    }
                }
            }
        } else {
            this._processTile(tile);
        }
    }

    this._mode = mode;
    this._projection = projection;
};

/**
 * DOC_TBA
 * @memberof CentralBody
 */
CentralBody.prototype.render = function(context) {
    if (this.show) {
        // clear FBO
        context.clear(context.createClearState({
            framebuffer : this._fb,
            color : {
                red : 0.0,
                green : 0.0,
                blue : 0.0,
                alpha : 0.0
            }
        }));

        if (this.showSkyAtmosphere) {
            context.draw({
                framebuffer : this._fb,
                primitiveType : PrimitiveType.TRIANGLES,
                shaderProgram : this._spSky,
                uniformMap : this._drawUniforms,
                vertexArray : this._vaSky,
                renderState : this._rsSky
            });
        }

        if (this._renderQueue.length === 0) {
            return;
        }

        var uniformState = context.getUniformState();
        var mv = uniformState.getModelView();

        context.beginDraw({
            framebuffer : this._fb,
            shaderProgram : this._sp,
            renderState : this._rsColor
        });

        // TODO: remove once multi-frustum/depth testing is implemented
        this._renderQueue.sort(function(a, b) {
            return a.zoom - b.zoom;
        });

        // render tiles to FBO
        while (this._renderQueue.length > 0) {
            var tile = this._renderQueue.dequeue();

            var rtc;
            if (this.morphTime === 1.0) {
                rtc = tile._drawUniforms.u_center3D();
                tile.mode = 0;
            } else if (this.morphTime === 0.0) {
                var center = tile._drawUniforms.u_center2D();
                rtc = new Cartesian3(0.0, center.x, center.y);
                tile.mode = 1;
            } else {
                rtc = Cartesian3.ZERO;
                tile.mode = 2;
            }
            var centerEye = mv.multiplyWithVector(new Cartesian4(rtc.x, rtc.y, rtc.z, 1.0));
            var mvrtc = mv.clone();
            mvrtc.setColumn3(centerEye);
            tile.modelView = mvrtc;

            context.continueDraw({
                primitiveType : PrimitiveType.TRIANGLES,
                vertexArray : tile._extentVA,
                uniformMap : tile._drawUniforms
            });
        }

        context.endDraw();

        // render quad with vertical gaussian blur with second-pass texture attached to FBO
        this._quadV.render(context);

        // render quad with horizontal gaussian blur
        this._quadH.render(context);

        // render depth plane
        if (this._mode === SceneMode.SCENE3D) {
            context.draw({
                primitiveType : PrimitiveType.TRIANGLES,
                shaderProgram : this._spDepth,
                vertexArray : this._vaDepth,
                renderState : this._rsDepth
            });
        }

        if (this._quadLogo && !this._quadLogo.isDestroyed()) {
            this._quadLogo.render(context);
        }
    }
};

/**
 * DOC_TBA
 * @memberof CentralBody
 */
CentralBody.prototype.renderForPick = function(context, framebuffer) {
    if (this.show) {
        if (this._mode === SceneMode.SCENE3D) {
            // Not actually pickable, but render depth-only so primitives on the backface
            // of the globe are not picked.
            context.draw({
                primitiveType : PrimitiveType.TRIANGLES,
                shaderProgram : this._spDepth,
                vertexArray : this._vaDepth,
                renderState : this._rsDepth,
                framebuffer : framebuffer
            });
        }
    }
};

CentralBody.prototype._destroyTileTree = function() {
    var stack = [this._rootTile];
    while (stack.length !== 0) {
        var tile = stack.pop();

        // remove circular reference
        tile.parent = undefined;

        // destroy vertex array
        if (tile._extentVA) {
            tile._extentVA = tile._extentVA && tile._extentVA.destroy();
        }

        // destroy texture
        if (tile.texture) {
            // if the texture isn't in the texture pool, destroy it; otherwise,
            // it already has been or will be destroyed by it.
            var width = tile.texture.getWidth();
            var height = tile.texture.getHeight();
            var usePool = this._texturePool && (width === this._texturePool.getWidth() && height === this._texturePool.getHeight());
            tile.texture = (usePool) ? undefined : tile.texture && tile.texture.destroy();
        }

        // process children
        if (tile.children) {
            stack = stack.concat(tile.children);
        }
    }

    this._rootTile = undefined;
};

/**
 * Returns true if this object was destroyed; otherwise, false.
 * <br /><br />
 * If this object was destroyed, it should not be used; calling any function other than
 * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.
 *
 * @memberof CentralBody
 *
 * @return {Boolean} True if this object was destroyed; otherwise, false.
 *
 * @see CentralBody#destroy
 */
CentralBody.prototype.isDestroyed = function() {
    return false;
};

/**
 * Destroys the WebGL resources held by this object.  Destroying an object allows for deterministic
 * release of WebGL resources, instead of relying on the garbage collector to destroy this object.
 * <br /><br />
 * Once an object is destroyed, it should not be used; calling any function other than
 * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.  Therefore,
 * assign the return value (<code>undefined</code>) to the object as done in the example.
 *
 * @memberof CentralBody
 *
 * @return {undefined}
 *
 * @exception {DeveloperError} This object was destroyed, i.e., destroy() was called.
 *
 * @see CentralBody#isDestroyed
 *
 * @example
 * centralBody = centralBody && centralBody.destroy();
 */
CentralBody.prototype.destroy = function() {
    this._texturePool = this._texturePool && this._texturePool.destroy();
    this._textureCache = this._textureCache && this._textureCache.destroy();

    this._destroyTileTree();
    this._fb = this._fb && this._fb.destroy();
    this._quadV = this._quadV && this._quadV.destroy();
    this._quadH = this._quadH && this._quadH.destroy();

    this._spWithoutAtmosphere = this._spWithoutAtmosphere && this._spWithoutAtmosphere.release();
    this._spGroundFromSpace = this._spGroundFromSpace && this._spGroundFromSpace.release();
    this._spGroundFromAtmosphere = this._spGroundFromAtmosphere && this._spGroundFromAtmosphere.release();

    this._vaSky = this._vaSky && this._vaSky.destroy();
    this._spSkyFromSpace = this._spSkyFromSpace && this._spSkyFromSpace.release();
    this._spSkyFromAtmosphere = this._spSkyFromAtmosphere && this._spSkyFromAtmosphere.release();

    this._spDepth = this._spDepth && this._spDepth.release();
    this._vaDepth = this._vaDepth && this._vaDepth.destroy();

    this._nightTexture = this._nightTexture && this._nightTexture.destroy();
    this._specularTexture = this._specularTexture && this._specularTexture.destroy();
    this._cloudsTexture = this._cloudsTexture && this._cloudsTexture.destroy();
    this._bumpTexture = this._bumpTexture && this._bumpTexture.destroy();

    return destroyObject(this);
};
