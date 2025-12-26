// leaflet.curve.js
// Source: https://github.com/elfalem/Leaflet.curve
(function (factory) {
  if (typeof define === 'function' && define.amd) {
    define(['leaflet'], factory);
  } else if (typeof exports === 'object') {
    module.exports = factory(require('leaflet'));
  } else {
    factory(L);
  }
}(function (L) {
  if (!L || !L.SVG) return;

  L.Curve = L.Path.extend({
    initialize: function (path, options) {
      L.setOptions(this, options);
      this._setPath(path);
    },
    getPath: function () {
      return this._path;
    },
    _setPath: function (path) {
      this._path = path;
    },
    _project: function () {
      this._points = [];
      this._points.push(this._map.latLngToLayerPoint(this._path[1]));
      this._points.push(this._map.latLngToLayerPoint(this._path[2]));
      this._points.push(this._map.latLngToLayerPoint(this._path[3]));
    },
    _update: function () {
      if (!this._map) return;
      this._renderer._updateCurve(this);
    },
    _updatePath: function () {
      this._renderer._updateCurve(this);
    }
  });

  L.curve = function (path, options) {
    return new L.Curve(path, options);
  };

  L.SVG.include({
    _updateCurve: function (layer) {
      this._setPath(layer, this._curvePath(layer));
    },
    _curvePath: function (layer) {
      var p = layer._points;
      return 'M' + p[0].x + ',' + p[0].y +
             ' Q' + p[1].x + ',' + p[1].y +
             ' ' + p[2].x + ',' + p[2].y;
    }
  });
}));
