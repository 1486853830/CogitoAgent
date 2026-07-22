import {
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
  geoJSONToKML,
} from '../../src/agent/tools/gis.ts';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('gis tools', () => {
  describe('isInChina', () => {
    it('should return true for China coordinates', async () => {
      const result = await isInChina(116.4074, 39.9042);
      expect(result.success).toBe(true);
      expect(result.data).toContain('在中国大陆范围内');
    });

    it('should return false for non-China coordinates', async () => {
      const result = await isInChina(-73.9857, 40.7484);
      expect(result.success).toBe(true);
      expect(result.data).toContain('不在中国大陆范围内');
    });
  });

  describe('convertCoord', () => {
    it('should convert WGS84 to GCJ02', async () => {
      const result = await convertCoord(116.4074, 39.9042, 'wgs84', 'gcj02');
      expect(result.success).toBe(true);
    });

    it('should convert GCJ02 to WGS84', async () => {
      const result = await convertCoord(116.4166, 39.9145, 'gcj02', 'wgs84');
      expect(result.success).toBe(true);
    });

    it('should convert GCJ02 to BD09', async () => {
      const result = await convertCoord(116.4166, 39.9145, 'gcj02', 'bd09');
      expect(result.success).toBe(true);
    });

    it('should convert BD09 to GCJ02', async () => {
      const result = await convertCoord(116.424, 39.9215, 'bd09', 'gcj02');
      expect(result.success).toBe(true);
    });

    it('should handle same source and target', async () => {
      const result = await convertCoord(116.4074, 39.9042, 'wgs84', 'wgs84');
      expect(result.success).toBe(true);
      expect(result.data).toContain('无需转换');
    });

    it('should reject invalid coordinate systems', async () => {
      const result = await convertCoord(116.4074, 39.9042, 'invalid', 'wgs84');
      expect(result.success).toBe(false);
    });

    it('should reject invalid numbers', async () => {
      const result = await convertCoord('abc', 39.9042, 'wgs84', 'gcj02');
      expect(result.success).toBe(false);
    });
  });

  describe('calcDistance', () => {
    it('should calculate distance in km', async () => {
      const result = await calcDistance(116.4074, 39.9042, 121.4737, 31.2304);
      expect(result.success).toBe(true);
      expect(result.data).toContain('千米');
    });

    it('should calculate distance in meters', async () => {
      const result = await calcDistance(116.4074, 39.9042, 116.4174, 39.9142, 'm');
      expect(result.success).toBe(true);
      expect(result.data).toContain('米');
    });
  });

  describe('calcArea', () => {
    it('should calculate polygon area', async () => {
      const polygon = [
        [116.4, 39.9],
        [116.5, 39.9],
        [116.5, 40.0],
        [116.4, 40.0],
      ];
      const result = await calcArea(polygon);
      expect(result.success).toBe(true);
    });

    it('should reject insufficient points', async () => {
      const result = await calcArea([
        [116.4, 39.9],
        [116.5, 39.9],
      ]);
      expect(result.success).toBe(false);
    });

    it('should handle JSON string input', async () => {
      const polygon = '[[116.4, 39.9], [116.5, 39.9], [116.5, 40.0], [116.4, 40.0]]';
      const result = await calcArea(polygon);
      expect(result.success).toBe(true);
    });
  });

  describe('calcCenter', () => {
    it('should calculate centroid of points', async () => {
      const points = [
        [116.0, 39.0],
        [117.0, 40.0],
        [118.0, 39.0],
      ];
      const result = await calcCenter(points);
      expect(result.success).toBe(true);
      expect(result.data).toContain('质心坐标');
    });

    it('should reject empty array', async () => {
      const result = await calcCenter([]);
      expect(result.success).toBe(false);
    });

    it('should handle JSON string input', async () => {
      const points = '[[116.0, 39.0], [117.0, 40.0]]';
      const result = await calcCenter(points);
      expect(result.success).toBe(true);
    });
  });

  describe('pointInPolygon', () => {
    it('should detect point inside polygon', async () => {
      const polygon = [
        [116.0, 39.0],
        [117.0, 39.0],
        [117.0, 40.0],
        [116.0, 40.0],
      ];
      const result = await pointInPolygon(116.5, 39.5, polygon);
      expect(result.success).toBe(true);
      expect(result.data).toContain('在多边形内部');
    });

    it('should detect point outside polygon', async () => {
      const polygon = [
        [116.0, 39.0],
        [117.0, 39.0],
        [117.0, 40.0],
        [116.0, 40.0],
      ];
      const result = await pointInPolygon(118.0, 41.0, polygon);
      expect(result.success).toBe(true);
      expect(result.data).toContain('在多边形外部');
    });

    it('should reject insufficient vertices', async () => {
      const polygon = [
        [116.0, 39.0],
        [117.0, 39.0],
      ];
      const result = await pointInPolygon(116.5, 39.5, polygon);
      expect(result.success).toBe(false);
    });
  });

  describe('readGeoJSON', () => {
    let tempDir: string;
    let geojsonPath: string;

    beforeAll(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gis-test-'));
      geojsonPath = path.join(tempDir, 'test.geojson');
    });

    afterAll(async () => {
      await fs.rm(tempDir, { recursive: true });
    });

    it('should read FeatureCollection', async () => {
      const geojson = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [116.4, 39.9] },
            properties: { name: 'Beijing' },
          },
        ],
      };
      await fs.writeFile(geojsonPath, JSON.stringify(geojson), 'utf-8');
      const result = await readGeoJSON(geojsonPath);
      expect(result.success).toBe(true);
      expect(result.data).toContain('FeatureCollection');
    });

    it('should reject invalid GeoJSON', async () => {
      await fs.writeFile(geojsonPath, '{"type": "Invalid"}', 'utf-8');
      const result = await readGeoJSON(geojsonPath);
      expect(result.success).toBe(false);
    });

    it('should handle file not found', async () => {
      const result = await readGeoJSON(path.join(tempDir, 'nonexistent.geojson'));
      expect(result.success).toBe(false);
    });
  });

  describe('queryGeoJSON', () => {
    let tempDir: string;
    let geojsonPath: string;

    beforeAll(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gis-query-test-'));
      geojsonPath = path.join(tempDir, 'query.geojson');
    });

    afterAll(async () => {
      await fs.rm(tempDir, { recursive: true });
    });

    it('should query features by property', async () => {
      const geojson = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [116.4, 39.9] },
            properties: { name: 'Beijing', type: 'city' },
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [121.5, 31.2] },
            properties: { name: 'Shanghai', type: 'city' },
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [113.2, 23.1] },
            properties: { name: 'Guangzhou', type: 'city' },
          },
        ],
      };
      await fs.writeFile(geojsonPath, JSON.stringify(geojson), 'utf-8');
      const result = await queryGeoJSON(geojsonPath, { name: 'Beijing' });
      expect(result.success).toBe(true);
      expect(result.data).toContain('Beijing');
    });

    it('should return no matches message', async () => {
      const geojson = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [116.4, 39.9] },
            properties: { name: 'Beijing' },
          },
        ],
      };
      await fs.writeFile(geojsonPath, JSON.stringify(geojson), 'utf-8');
      const result = await queryGeoJSON(geojsonPath, { name: 'Tokyo' });
      expect(result.success).toBe(true);
      expect(result.data).toContain('未找到匹配');
    });

    it('should reject non-FeatureCollection', async () => {
      await fs.writeFile(
        geojsonPath,
        '{"type": "Feature", "geometry": {"type": "Point", "coordinates": [116.4, 39.9]}}',
        'utf-8',
      );
      const result = await queryGeoJSON(geojsonPath, { name: 'test' });
      expect(result.success).toBe(false);
    });
  });

  describe('geoJSONStats', () => {
    let tempDir: string;
    let geojsonPath: string;

    beforeAll(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gis-stats-test-'));
      geojsonPath = path.join(tempDir, 'stats.geojson');
    });

    afterAll(async () => {
      await fs.rm(tempDir, { recursive: true });
    });

    it('should calculate stats for FeatureCollection', async () => {
      const geojson = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [116.4, 39.9] },
            properties: { name: 'Beijing', population: 21500000 },
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [121.5, 31.2] },
            properties: { name: 'Shanghai', population: 24200000 },
          },
        ],
      };
      await fs.writeFile(geojsonPath, JSON.stringify(geojson), 'utf-8');
      const result = await geoJSONStats(geojsonPath);
      expect(result.success).toBe(true);
      expect(result.data).toContain('totalFeatures');
    });

    it('should reject non-FeatureCollection', async () => {
      await fs.writeFile(geojsonPath, '{"type": "Invalid"}', 'utf-8');
      const result = await geoJSONStats(geojsonPath);
      expect(result.success).toBe(false);
    });
  });

  describe('geoJSONToCSV', () => {
    let tempDir: string;
    let geojsonPath: string;
    let csvPath: string;

    beforeAll(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gis-csv-test-'));
      geojsonPath = path.join(tempDir, 'input.geojson');
      csvPath = path.join(tempDir, 'output.csv');
    });

    afterAll(async () => {
      await fs.rm(tempDir, { recursive: true });
    });

    it('should convert GeoJSON to CSV', async () => {
      const geojson = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [116.4, 39.9] },
            properties: { name: 'Beijing' },
          },
        ],
      };
      await fs.writeFile(geojsonPath, JSON.stringify(geojson), 'utf-8');
      const result = await geoJSONToCSV(geojsonPath, csvPath);
      expect(result.success).toBe(true);
      expect(result.data).toContain('导出');
    });

    it('should handle empty features', async () => {
      const geojson = { type: 'FeatureCollection', features: [] };
      await fs.writeFile(geojsonPath, JSON.stringify(geojson), 'utf-8');
      const result = await geoJSONToCSV(geojsonPath, csvPath);
      expect(result.success).toBe(false);
    });
  });

  describe('geoJSONToKML', () => {
    let tempDir: string;
    let geojsonPath: string;
    let kmlPath: string;

    beforeAll(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gis-kml-test-'));
      geojsonPath = path.join(tempDir, 'input.geojson');
      kmlPath = path.join(tempDir, 'output.kml');
    });

    afterAll(async () => {
      await fs.rm(tempDir, { recursive: true });
    });

    it('should convert GeoJSON to KML', async () => {
      const geojson = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [116.4, 39.9] },
            properties: { name: 'Beijing' },
          },
        ],
      };
      await fs.writeFile(geojsonPath, JSON.stringify(geojson), 'utf-8');
      const result = await geoJSONToKML(geojsonPath, kmlPath);
      expect(result.success).toBe(true);
      expect(result.data).toContain('导出');
    });

    it('should handle different geometry types', async () => {
      const geojson = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [116.4, 39.9],
                [116.5, 40.0],
              ],
            },
            properties: { name: 'Line' },
          },
          {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [116.4, 39.9],
                  [116.5, 39.9],
                  [116.5, 40.0],
                  [116.4, 40.0],
                  [116.4, 39.9],
                ],
              ],
            },
            properties: { name: 'Polygon' },
          },
        ],
      };
      await fs.writeFile(geojsonPath, JSON.stringify(geojson), 'utf-8');
      const result = await geoJSONToKML(geojsonPath, kmlPath);
      expect(result.success).toBe(true);
    });
  });
});
