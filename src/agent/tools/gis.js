/**
 * 地理信息技术（GIS）工具
 * 提供坐标转换、空间计算、GeoJSON 处理等功能
 */

import fs from 'fs/promises';
import path from 'path';
import { getBasePath } from './path.js';

// ============================================
// 常量定义
// ============================================
const PI = Math.PI;
const A = 6378245.0; // 地球半长轴（GCJ02 使用）
const EE = 0.00669342162296594323; // 偏心率平方

const EARTH_RADIUS_KM = 6371.0; // 地球平均半径（km）
const EARTH_RADIUS_M = 6371000; // 地球平均半径（m）

// 中国大致经纬度范围
const CHINA_BBOX = { minLng: 73.66, maxLng: 135.05, minLat: 3.86, maxLat: 53.55 };

// ============================================
// 坐标转换辅助函数（GCJ02 加密算法）
// ============================================

function transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * PI) + 320.0 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLon(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
  return ret;
}

function isOutOfChina(lng, lat) {
  return (lng < CHINA_BBOX.minLng || lng > CHINA_BBOX.maxLng ||
          lat < CHINA_BBOX.minLat || lat > CHINA_BBOX.maxLat);
}

/**
 * WGS84 → GCJ02
 */
function wgs84ToGcj02(lng, lat) {
  if (isOutOfChina(lng, lat)) {
    return { lng, lat };
  }
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLon(lng - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
  dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);
  return {
    lng: lng + dLng,
    lat: lat + dLat
  };
}

/**
 * GCJ02 → WGS84
 */
function gcj02ToWgs84(lng, lat) {
  if (isOutOfChina(lng, lat)) {
    return { lng, lat };
  }
  const gcj = wgs84ToGcj02(lng, lat);
  return {
    lng: 2 * lng - gcj.lng,
    lat: 2 * lat - gcj.lat
  };
}

/**
 * GCJ02 → BD09
 */
function gcj02ToBd09(lng, lat) {
  const x = lng;
  const y = lat;
  const z = Math.sqrt(x * x + y * y) + 0.00002 * Math.sin(y * PI);
  const theta = Math.atan2(y, x) + 0.000003 * Math.cos(x * PI);
  return {
    lng: z * Math.cos(theta) + 0.0065,
    lat: z * Math.sin(theta) + 0.006
  };
}

/**
 * BD09 → GCJ02
 */
function bd09ToGcj02(lng, lat) {
  const x = lng - 0.0065;
  const y = lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * PI);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * PI);
  return {
    lng: z * Math.cos(theta),
    lat: z * Math.sin(theta)
  };
}

// ============================================
// 公开工具函数
// ============================================

/**
 * 判断坐标是否在中国大陆范围内
 * @param {number} lng - 经度
 * @param {number} lat - 纬度
 * @returns {Promise<Object>} 结果对象
 */
async function isInChina(lng, lat) {
  try {
    const result = !isOutOfChina(lng, lat);
    return {
      success: true,
      data: result ? '坐标在中国大陆范围内' : '坐标不在中国大陆范围内'
    };
  } catch (error) {
    return { success: false, error: `判断失败: ${error.message}` };
  }
}

/**
 * 坐标系统转换（支持 WGS84 / GCJ02 / BD09 互转）
 * @param {number} lng - 经度
 * @param {number} lat - 纬度
 * @param {string} from - 源坐标系：'wgs84' | 'gcj02' | 'bd09'
 * @param {string} to - 目标坐标系：'wgs84' | 'gcj02' | 'bd09'
 * @returns {Promise<Object>} 结果对象
 */
async function convertCoord(lng, lat, from, to) {
  try {
    lng = Number(lng);
    lat = Number(lat);
    if (isNaN(lng) || isNaN(lat)) {
      return { success: false, error: '经纬度必须为有效数字' };
    }
    const fromNorm = from.toLowerCase().trim();
    const toNorm = to.toLowerCase().trim();

    const validSystems = ['wgs84', 'gcj02', 'bd09'];
    if (!validSystems.includes(fromNorm) || !validSystems.includes(toNorm)) {
      return {
        success: false,
        error: `不支持的坐标系: ${from} → ${to}，仅支持 wgs84、gcj02、bd09`
      };
    }

    if (fromNorm === toNorm) {
      return {
        success: true,
        data: `坐标系无需转换: (${lng}, ${lat})`
      };
    }

    let result = { lng, lat };

    // 统一转到 GCJ02 中间坐标系
    if (fromNorm === 'wgs84') {
      result = wgs84ToGcj02(result.lng, result.lat);
    } else if (fromNorm === 'bd09') {
      result = bd09ToGcj02(result.lng, result.lat);
    }
    // else fromNorm === 'gcj02'，无需转换

    // 从 GCJ02 转到目标坐标系
    if (toNorm === 'wgs84') {
      result = gcj02ToWgs84(result.lng, result.lat);
    } else if (toNorm === 'bd09') {
      result = gcj02ToBd09(result.lng, result.lat);
    }
    // else toNorm === 'gcj02'，无需转换

    return {
      success: true,
      data: `坐标转换完成: ${from}(${lng}, ${lat}) → ${to}(${result.lng.toFixed(6)}, ${result.lat.toFixed(6)})`
    };
  } catch (error) {
    return { success: false, error: `坐标转换失败: ${error.message}` };
  }
}

/**
 * 计算两点之间的距离（Haversine 公式）
 * @param {number} lng1 - 起点经度
 * @param {number} lat1 - 起点纬度
 * @param {number} lng2 - 终点经度
 * @param {number} lat2 - 终点纬度
 * @param {string} [unit='km'] - 单位：'m'（米）或 'km'（千米）
 * @returns {Promise<Object>} 结果对象
 */
async function calcDistance(lng1, lat1, lng2, lat2, unit = 'km') {
  try {
    const toRad = (deg) => deg * PI / 180;
    const dLng = toRad(lng2 - lng1);
    const dLat = toRad(lat2 - lat1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const unitNorm = unit.toLowerCase();
    let distance, unitLabel;
    if (unitNorm === 'm') {
      distance = EARTH_RADIUS_M * c;
      unitLabel = '米';
    } else {
      distance = EARTH_RADIUS_KM * c;
      unitLabel = '千米';
    }

    return {
      success: true,
      data: `两点距离: ${distance.toFixed(4)} ${unitLabel}`
    };
  } catch (error) {
    return { success: false, error: `距离计算失败: ${error.message}` };
  }
}

/**
 * 计算多边形面积（Shoelace 公式）
 * @param {Array|string} coordinates - 坐标数组或 JSON 字符串 [[lng,lat], ...]
 * @returns {Promise<Object>} 结果对象
 */
async function calcArea(coordinates) {
  try {
    const coords = typeof coordinates === 'string' ? JSON.parse(coordinates) : coordinates;

    if (!Array.isArray(coords) || coords.length < 3) {
      return { success: false, error: '多边形至少需要 3 个顶点' };
    }

    // 确保首尾闭合
    const ring = coords.length > 0 &&
      coords[0][0] === coords[coords.length - 1][0] &&
      coords[0][1] === coords[coords.length - 1][1]
      ? coords : [...coords, coords[0]];

    // 使用 Shoelace 公式计算平面面积
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      area += ring[i][0] * ring[i + 1][1];
      area -= ring[i + 1][0] * ring[i][1];
    }
    area = Math.abs(area) / 2;

    // 粗略估算球面面积（平方千米）
    // 将经纬度差转换为弧度，再乘以地球半径平方
    const avgLat = ring.reduce((sum, p) => sum + p[1], 0) / ring.length;
    const radLat = avgLat * PI / 180;
    const lngScale = EARTH_RADIUS_KM * Math.cos(radLat) * PI / 180;
    const latScale = EARTH_RADIUS_KM * PI / 180;
    const areaKm2 = area * lngScale * latScale;

    // 选择合适的单位
    let displayArea, unit;
    if (areaKm2 >= 1) {
      displayArea = areaKm2;
      unit = '平方千米';
    } else if (areaKm2 >= 0.0001) {
      displayArea = areaKm2 * 1000000;
      unit = '平方米';
    } else {
      displayArea = areaKm2 * 1000000;
      unit = '平方米';
    }

    return {
      success: true,
      data: `多边形面积: ${displayArea.toFixed(4)} ${unit}（平面面积: ${area.toFixed(4)}）`
    };
  } catch (error) {
    return { success: false, error: `面积计算失败: ${error.message}` };
  }
}

/**
 * 计算多边形/多点质心
 * @param {Array|string} coordinates - 坐标数组或 JSON 字符串
 * @returns {Promise<Object>} 结果对象
 */
async function calcCenter(coordinates) {
  try {
    const coords = typeof coordinates === 'string' ? JSON.parse(coordinates) : coordinates;

    if (!Array.isArray(coords) || coords.length === 0) {
      return { success: false, error: '坐标数组不能为空' };
    }

    let sumLng = 0, sumLat = 0;
    for (const point of coords) {
      sumLng += point[0];
      sumLat += point[1];
    }

    const centerLng = sumLng / coords.length;
    const centerLat = sumLat / coords.length;

    return {
      success: true,
      data: `质心坐标: (${centerLng.toFixed(6)}, ${centerLat.toFixed(6)})`
    };
  } catch (error) {
    return { success: false, error: `质心计算失败: ${error.message}` };
  }
}

/**
 * 判断点是否在多边形内（射线法）
 * @param {number} lng - 点的经度
 * @param {number} lat - 点的纬度
 * @param {Array|string} polygon - 多边形坐标数组或 JSON 字符串
 * @returns {Promise<Object>} 结果对象
 */
async function pointInPolygon(lng, lat, polygon) {
  try {
    const ring = typeof polygon === 'string' ? JSON.parse(polygon) : polygon;

    if (!Array.isArray(ring) || ring.length < 3) {
      return { success: false, error: '多边形至少需要 3 个顶点' };
    }

    // 射线法判断
    let inside = false;
    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];

      if ((yi > lat) !== (yj > lat) &&
          lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }

    return {
      success: true,
      data: inside
        ? `点 (${lng}, ${lat}) 在多边形内部`
        : `点 (${lng}, ${lat}) 在多边形外部`
    };
  } catch (error) {
    return { success: false, error: `判断失败: ${error.message}` };
  }
}

/**
 * 读取 GeoJSON 文件
 * @param {string} filePath - GeoJSON 文件路径
 * @returns {Promise<Object>} 结果对象
 */
async function readGeoJSON(filePath) {
  const basePath = getBasePath();
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(basePath, filePath);

  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    const data = JSON.parse(content);

    if (data.type !== 'FeatureCollection' && data.type !== 'Feature' && !data.type?.endsWith('Geometry')) {
      return { success: false, error: '不是有效的 GeoJSON 格式' };
    }

    // 提取统计信息
    let featureCount = 0;
    const geometryTypes = {};
    let bounds = null;

    const features = data.type === 'FeatureCollection' ? data.features :
                     data.type === 'Feature' ? [data] : [];

    for (const feature of features) {
      featureCount++;
      const geomType = feature.geometry?.type || 'Unknown';
      geometryTypes[geomType] = (geometryTypes[geomType] || 0) + 1;

      // 计算范围
      const coords = extractCoords(feature.geometry);
      for (const [clng, clat] of coords) {
        if (!bounds) {
          bounds = { minLng: clng, maxLng: clng, minLat: clat, maxLat: clat };
        } else {
          if (clng < bounds.minLng) bounds.minLng = clng;
          if (clng > bounds.maxLng) bounds.maxLng = clng;
          if (clat < bounds.minLat) bounds.minLat = clat;
          if (clat > bounds.maxLat) bounds.maxLat = clat;
        }
      }
    }

    const summary = {
      type: data.type,
      featureCount,
      geometryTypes,
      bounds: bounds ? {
        lngRange: [bounds.minLng.toFixed(6), bounds.maxLng.toFixed(6)],
        latRange: [bounds.minLat.toFixed(6), bounds.maxLat.toFixed(6)]
      } : null,
      properties: features.length > 0 ? Object.keys(features[0].properties || {}) : []
    };

    return {
      success: true,
      data: JSON.stringify(summary, null, 2)
    };
  } catch (error) {
    return { success: false, error: `读取 GeoJSON 失败: ${error.message}` };
  }
}

/**
 * 递归提取 GeoJSON 几何中的所有坐标
 */
function extractCoords(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Point') return [geometry.coordinates];
  if (geometry.type === 'MultiPoint' || geometry.type === 'LineString') return geometry.coordinates;
  if (geometry.type === 'MultiLineString' || geometry.type === 'Polygon') {
    const coords = [];
    for (const ring of geometry.coordinates) {
      coords.push(...ring);
    }
    return coords;
  }
  if (geometry.type === 'MultiPolygon') {
    const coords = [];
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        coords.push(...ring);
      }
    }
    return coords;
  }
  if (geometry.type === 'GeometryCollection') {
    const coords = [];
    for (const geom of geometry.geometries || []) {
      coords.push(...extractCoords(geom));
    }
    return coords;
  }
  return [];
}

/**
 * 按属性查询 GeoJSON 要素
 * @param {string} filePath - GeoJSON 文件路径
 * @param {Object|string} filter - 过滤条件 JSON 对象或字符串，如 {"name": "北京"}
 * @returns {Promise<Object>} 结果对象
 */
async function queryGeoJSON(filePath, filter) {
  const basePath = getBasePath();
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(basePath, filePath);

  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    const data = JSON.parse(content);

    if (data.type !== 'FeatureCollection') {
      return { success: false, error: '仅支持 FeatureCollection 类型查询' };
    }

    const conditions = typeof filter === 'string' ? JSON.parse(filter) : filter;

    const matched = data.features.filter(feature => {
      for (const [key, value] of Object.entries(conditions)) {
        const propValue = feature.properties?.[key];
        if (propValue === undefined) return false;
        if (String(propValue).toLowerCase() !== String(value).toLowerCase()) return false;
      }
      return true;
    });

    if (matched.length === 0) {
      return { success: true, data: '未找到匹配的要素' };
    }

    const result = {
      type: 'FeatureCollection',
      features: matched,
      matched: matched.length,
      total: data.features.length
    };

    return {
      success: true,
      data: JSON.stringify(result, null, 2).slice(0, 30000)
    };
  } catch (error) {
    return { success: false, error: `查询失败: ${error.message}` };
  }
}

/**
 * GeoJSON 统计信息
 * @param {string} filePath - GeoJSON 文件路径
 * @returns {Promise<Object>} 结果对象
 */
async function geoJSONStats(filePath) {
  const basePath = getBasePath();
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(basePath, filePath);

  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    const data = JSON.parse(content);

    if (data.type !== 'FeatureCollection') {
      return { success: false, error: '仅支持 FeatureCollection 统计' };
    }

    const features = data.features || [];
    const total = features.length;

    // 几何类型统计
    const geomTypes = {};
    for (const f of features) {
      const type = f.geometry?.type || 'Unknown';
      geomTypes[type] = (geomTypes[type] || 0) + 1;
    }

    // 属性字段统计
    const propFields = {};
    for (const f of features) {
      if (f.properties) {
        for (const key of Object.keys(f.properties)) {
          propFields[key] = (propFields[key] || 0) + 1;
        }
      }
    }

    // 属性值唯一值统计（前几个字段）
    const propSample = {};
    const topFields = Object.keys(propFields).slice(0, 5);
    for (const field of topFields) {
      const values = new Set();
      for (const f of features) {
        const val = f.properties?.[field];
        if (val !== undefined && val !== null) {
          values.add(String(val));
        }
      }
      propSample[field] = {
        fillRate: `${((values.size > 0 ? features.filter(f => f.properties?.[field] !== undefined && f.properties?.[field] !== null).length : 0) / total * 100).toFixed(1)}%`,
        uniqueValues: values.size,
        samples: [...values].slice(0, 5)
      };
    }

    const stats = {
      totalFeatures: total,
      geometryTypes: geomTypes,
      propertyFields: Object.keys(propFields),
      propertyStats: propSample,
      hasBounds: features.length > 0
    };

    return {
      success: true,
      data: JSON.stringify(stats, null, 2)
    };
  } catch (error) {
    return { success: false, error: `统计失败: ${error.message}` };
  }
}

/**
 * GeoJSON 属性表导出为 CSV
 * @param {string} geojsonPath - GeoJSON 文件路径
 * @param {string} csvPath - 输出 CSV 路径
 * @returns {Promise<Object>} 结果对象
 */
async function geoJSONToCSV(geojsonPath, csvPath) {
  const basePath = getBasePath();
  const fullGeojsonPath = path.isAbsolute(geojsonPath) ? geojsonPath : path.join(basePath, geojsonPath);
  const fullCsvPath = path.isAbsolute(csvPath) ? csvPath : path.join(basePath, csvPath);

  try {
    const content = await fs.readFile(fullGeojsonPath, 'utf-8');
    const data = JSON.parse(content);

    const features = data.type === 'FeatureCollection' ? data.features :
                     data.type === 'Feature' ? [data] : [];

    if (features.length === 0) {
      return { success: false, error: '没有要素可导出' };
    }

    // 收集所有属性字段
    const allFields = new Set(['geometry_type']);
    for (const f of features) {
      if (f.properties) {
        for (const key of Object.keys(f.properties)) {
          allFields.add(key);
        }
      }
    }
    const fields = [...allFields];

    // 构建 CSV
    const csvLines = [fields.join(',')];
    for (const f of features) {
      const row = fields.map(field => {
        if (field === 'geometry_type') {
          return f.geometry?.type || '';
        }
        const val = f.properties?.[field];
        if (val === undefined || val === null) return '';
        const strVal = String(val);
        if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
          return `"${strVal.replace(/"/g, '""')}"`;
        }
        return strVal;
      });
      csvLines.push(row.join(','));
    }

    // 写入 CSV
    const dir = path.dirname(fullCsvPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullCsvPath, csvLines.join('\n'), 'utf-8');

    return {
      success: true,
      data: `已导出 ${features.length} 个要素的属性到 CSV: ${fullCsvPath}`
    };
  } catch (error) {
    return { success: false, error: `导出 CSV 失败: ${error.message}` };
  }
}

/**
 * GeoJSON 转换为 KML 格式
 * @param {string} geojsonPath - GeoJSON 文件路径
 * @param {string} kmlPath - 输出 KML 路径
 * @returns {Promise<Object>} 结果对象
 */
async function geoJSONToKML(geojsonPath, kmlPath) {
  const basePath = getBasePath();
  const fullGeojsonPath = path.isAbsolute(geojsonPath) ? geojsonPath : path.join(basePath, geojsonPath);
  const fullKmlPath = path.isAbsolute(kmlPath) ? kmlPath : path.join(basePath, kmlPath);

  try {
    const content = await fs.readFile(fullGeojsonPath, 'utf-8');
    const data = JSON.parse(content);

    const features = data.type === 'FeatureCollection' ? data.features :
                     data.type === 'Feature' ? [data] : [];

    let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
`;

    for (const feature of features) {
      const name = feature.properties?.name || feature.properties?.Name || 'Unnamed';
      const desc = feature.properties?.description || '';

      kml += `  <Placemark>\n    <name>${escapeXml(name)}</name>\n    <description>${escapeXml(String(desc))}</description>\n`;
      kml += geomToKML(feature.geometry, '    ');
      kml += `  </Placemark>\n`;
    }

    kml += `</Document>\n</kml>`;

    const dir = path.dirname(fullKmlPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullKmlPath, kml, 'utf-8');

    return {
      success: true,
      data: `已导出 ${features.length} 个要素到 KML: ${fullKmlPath}`
    };
  } catch (error) {
    return { success: false, error: `导出 KML 失败: ${error.message}` };
  }
}

function escapeXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function geomToKML(geometry, indent) {
  if (!geometry) return '';
  switch (geometry.type) {
    case 'Point':
      return `${indent}<Point><coordinates>${geometry.coordinates[0]},${geometry.coordinates[1]},0</coordinates></Point>\n`;
    case 'MultiPoint':
    case 'LineString': {
      const coords = geometry.coordinates.map(c => `${c[0]},${c[1]},0`).join(' ');
      return `${indent}<LineString><coordinates>${coords}</coordinates></LineString>\n`;
    }
    case 'Polygon': {
      let result = `${indent}<Polygon>\n`;
      for (let i = 0; i < geometry.coordinates.length; i++) {
        const ring = geometry.coordinates[i];
        const coords = ring.map(c => `${c[0]},${c[1]},0`).join(' ');
        const tag = i === 0 ? 'outerBoundaryIs' : 'innerBoundaryIs';
        result += `${indent}  <${tag}><LinearRing><coordinates>${coords}</coordinates></LinearRing></${tag}>\n`;
      }
      result += `${indent}</Polygon>\n`;
      return result;
    }
    default:
      return `${indent}<!-- 不支持的几何类型: ${geometry.type} -->\n`;
  }
}

export {
  convertCoord,
  calcDistance,
  calcArea,
  calcCenter,
  pointInPolygon,
  isInChina,
  readGeoJSON,
  queryGeoJSON,
  geoJSONStats,
  geoJSONToCSV,
  geoJSONToKML
};