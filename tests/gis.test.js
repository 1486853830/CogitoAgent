import * as gis from '../src/agent/tools/gis.js';

describe('GIS 地理信息工具', () => {
  describe('坐标转换', () => {
    it('should convert WGS84 to GCJ02', async () => {
      const result = await gis.convertCoord(116.397428, 39.90923, 'wgs84', 'gcj02');
      expect(result.success).toBe(true);
      expect(result.data).toContain('116.40');
      expect(result.data).toContain('39.91');
    });

    it('should convert GCJ02 to BD09', async () => {
      const result = await gis.convertCoord(116.403875, 39.915168, 'gcj02', 'bd09');
      expect(result.success).toBe(true);
      expect(result.data).toContain('116.41');
      expect(result.data).toContain('39.92');
    });

    it('should handle invalid coordinate system', async () => {
      const result = await gis.convertCoord(116.4, 39.9, 'invalid', 'wgs84');
      expect(result.success).toBe(false);
    });

    it('should check if coordinate is in China', async () => {
      const beijing = await gis.isInChina(116.4, 39.9);
      expect(beijing.success).toBe(true);
      expect(beijing.data).toContain('中国大陆');

      const tokyo = await gis.isInChina(139.7, 35.7);
      expect(tokyo.success).toBe(true);
      expect(tokyo.data).toContain('不在');
    });
  });

  describe('距离计算', () => {
    it('should calculate distance between Beijing and Shanghai', async () => {
      const result = await gis.calcDistance(116.4, 39.9, 121.5, 31.2);
      expect(result.success).toBe(true);
      expect(result.data).toContain('千米');
    });

    it('should calculate in meters', async () => {
      const result = await gis.calcDistance(116.4, 39.9, 116.401, 39.901, 'm');
      expect(result.success).toBe(true);
      expect(result.data).toContain('米');
    });
  });

  describe('面积计算', () => {
    it('should calculate area of a square polygon', async () => {
      const polygon = [
        [116.4, 39.9],
        [116.401, 39.9],
        [116.401, 39.901],
        [116.4, 39.901],
        [116.4, 39.9]
      ];
      const result = await gis.calcArea(polygon);
      expect(result.success).toBe(true);
      expect(result.data).toContain('平方米');
    });

    it('should calculate centroid', async () => {
      const polygon = [
        [116.3, 39.8],
        [116.5, 39.8],
        [116.5, 40.0],
        [116.3, 40.0],
        [116.3, 39.8]
      ];
      const result = await gis.calcCenter(polygon);
      expect(result.success).toBe(true);
      expect(result.data).toContain('116.38');
      expect(result.data).toContain('39.88');
    });
  });

  describe('点面关系', () => {
    it('should detect point inside polygon', async () => {
      const polygon = [
        [116.3, 39.8],
        [116.5, 39.8],
        [116.5, 40.0],
        [116.3, 40.0],
        [116.3, 39.8]
      ];
      const result = await gis.pointInPolygon(116.4, 39.9, polygon);
      expect(result.success).toBe(true);
      expect(result.data).toContain('内部');
    });

    it('should detect point outside polygon', async () => {
      const polygon = [
        [116.3, 39.8],
        [116.5, 39.8],
        [116.5, 40.0],
        [116.3, 40.0],
        [116.3, 39.8]
      ];
      const result = await gis.pointInPolygon(116.2, 39.9, polygon);
      expect(result.success).toBe(true);
      expect(result.data).toContain('外部');
    });
  });
});