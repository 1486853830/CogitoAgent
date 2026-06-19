/**
 * 重试与熔断模块
 * 为网络请求等不稳定操作提供重试机制和熔断保护
 */

import { traceError, startTimer } from './tracing.js';

// 默认配置
const DEFAULT_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,      // 初始延迟（毫秒）
  maxDelay: 10000,          // 最大延迟（毫秒）
  backoffMultiplier: 2,    // 退避倍数
  retryableErrors: [
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ENETUNREACH',
    'EAI_AGAIN',
    'socket hang up',
    'getaddrinfo',
    'TimeoutError',
    'fetch failed'
  ]
};

// 熔断器状态
const CIRCUIT_STATES = {
  CLOSED: 'closed',       // 正常，允许请求
  OPEN: 'open',           // 熔断，拒绝请求
  HALF_OPEN: 'half_open' // 半开，允许一个请求
};

// 熔断器类
class CircuitBreaker {
  constructor(name, config = {}) {
    this.name = name;
    this.config = {
      failureThreshold: config.failureThreshold || 5,    // 失败阈值
      resetTimeout: config.resetTimeout || 60000,        // 重置超时（毫秒）
      halfOpenRequests: config.halfOpenRequests || 1    // 半开状态允许的请求数
    };
    
    this.state = CIRCUIT_STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.halfOpenAttempts = 0;
  }

  /**
   * 检查是否允许请求
   */
  canExecute() {
    switch (this.state) {
      case CIRCUIT_STATES.CLOSED:
        return true;
        
      case CIRCUIT_STATES.OPEN:
        // 检查是否超时可以进入半开状态
        if (Date.now() - this.lastFailureTime > this.config.resetTimeout) {
          this.state = CIRCUIT_STATES.HALF_OPEN;
          this.halfOpenAttempts = 0;
          return true;
        }
        return false;
        
      case CIRCUIT_STATES.HALF_OPEN:
        // 半开状态只允许少量请求
        return this.halfOpenAttempts < this.config.halfOpenRequests;
        
      default:
        return true;
    }
  }

  /**
   * 记录成功
   */
  recordSuccess() {
    this.successCount++;
    this.halfOpenAttempts++;
    
    if (this.state === CIRCUIT_STATES.HALF_OPEN) {
      // 半开状态连续成功，关闭熔断器
      this.reset();
    } else {
      // 正常状态，重置失败计数
      this.failureCount = 0;
    }
  }

  /**
   * 记录失败
   */
  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.halfOpenAttempts++;
    
    if (this.state === CIRCUIT_STATES.HALF_OPEN) {
      // 半开状态失败，重新打开熔断器
      this.state = CIRCUIT_STATES.OPEN;
    } else if (this.failureCount >= this.config.failureThreshold) {
      // 达到阈值，打开熔断器
      this.state = CIRCUIT_STATES.OPEN;
    }
  }

  /**
   * 重置熔断器
   */
  reset() {
    this.state = CIRCUIT_STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.halfOpenAttempts = 0;
  }

  /**
   * 获取状态信息
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      timeUntilRetry: this.state === CIRCUIT_STATES.OPEN 
        ? Math.max(0, this.config.resetTimeout - (Date.now() - this.lastFailureTime))
        : 0
    };
  }
}

// 全局熔断器实例
const circuitBreakers = new Map();

/**
 * 获取或创建熔断器
 */
function getCircuitBreaker(name, config) {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker(name, config));
  }
  return circuitBreakers.get(name);
}

/**
 * 检查是否为可重试的错误
 */
function isRetryableError(error) {
  if (!error) return false;
  
  const errorStr = error.message || error.code || String(error);
  return DEFAULT_CONFIG.retryableErrors.some(e => 
    errorStr.toLowerCase().includes(e.toLowerCase())
  );
}

/**
 * 计算退避延迟
 */
function calculateBackoff(attempt, config) {
  const delay = Math.min(
    config.initialDelay * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelay
  );
  
  // 添加随机抖动（0-25%）
  const jitter = delay * Math.random() * 0.25;
  return Math.round(delay + jitter);
}

/**
 * 带重试的执行函数
 */
async function withRetry(fn, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const { maxRetries, onRetry, name } = config;
  
  let lastError = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const timer = startTimer();
      const result = await fn(attempt);
      const duration = timer.stop();
      
      return {
        success: true,
        data: result,
        attempts: attempt + 1,
        duration
      };
    } catch (error) {
      lastError = error;
      
      // 记录错误追踪
      traceError(error, { attempt: attempt + 1, maxRetries, name });
      
      // 检查是否应该重试
      if (attempt < maxRetries && isRetryableError(error)) {
        const delay = calculateBackoff(attempt, config);
        
        if (onRetry) {
          onRetry({
            attempt: attempt + 1,
            maxRetries,
            error: error.message,
            nextDelay: delay
          });
        }
        
        // 等待后重试
        await sleep(delay);
      } else {
        // 不再重试
        break;
      }
    }
  }
  
  return {
    success: false,
    error: lastError?.message || lastError,
    attempts: maxRetries + 1,
    code: lastError?.code
  };
}

/**
 * 带熔断的执行函数
 */
async function withCircuitBreaker(fn, breakerName, breakerConfig = {}) {
  const breaker = getCircuitBreaker(breakerName, breakerConfig);
  
  if (!breaker.canExecute()) {
    const status = breaker.getStatus();
    return {
      success: false,
      error: `Circuit breaker '${breakerName}' is ${status.state}`,
      code: 'CIRCUIT_OPEN',
      retryAfter: Math.ceil(status.timeUntilRetry / 1000)
    };
  }
  
  try {
    const timer = startTimer();
    const result = await fn();
    const duration = timer.stop();
    
    breaker.recordSuccess();
    
    return {
      success: true,
      data: result,
      duration
    };
  } catch (error) {
    breaker.recordFailure();
    
    return {
      success: false,
      error: error.message,
      code: error.code
    };
  }
}

/**
 * 带熔断和重试的执行函数
 */
async function withCircuitAndRetry(fn, options = {}) {
  const {
    name = 'default',
    breakerConfig = {},
    retryConfig = {},
    enableBreaker = true,
    enableRetry = true
  } = options;
  
  const execute = async () => {
    if (enableBreaker) {
      return withCircuitBreaker(fn, name, breakerConfig);
    } else {
      const timer = startTimer();
      try {
        const result = await fn();
        return { success: true, data: result, duration: timer.stop() };
      } catch (error) {
        return { success: false, error: error.message, code: error.code };
      }
    }
  };
  
  if (enableRetry) {
    return withRetry(execute, { name, ...retryConfig });
  }
  
  return execute();
}

/**
 * 睡眠函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 获取所有熔断器状态
 */
function getAllBreakerStatus() {
  const status = {};
  for (const [name, breaker] of circuitBreakers) {
    status[name] = breaker.getStatus();
  }
  return status;
}

/**
 * 重置所有熔断器
 */
function resetAllBreakers() {
  for (const breaker of circuitBreakers.values()) {
    breaker.reset();
  }
}

/**
 * 清理熔断器
 */
function clearBreaker(name) {
  circuitBreakers.delete(name);
}

export {
  CircuitBreaker,
  getCircuitBreaker,
  isRetryableError,
  calculateBackoff,
  withRetry,
  withCircuitBreaker,
  withCircuitAndRetry,
  getAllBreakerStatus,
  resetAllBreakers,
  clearBreaker,
  CIRCUIT_STATES
};
