// ============================================================
// compute-engine — Noyau de calcul parallele Rust/WebGPU
// Gen3ia AI Agent OS
//
// Architecture:
//   - WebGPU Compute Shaders (parallelisme GPU)
//   - Rayon (parallelisme CPU multi-coeur)
//   - NAPI bindings pour integration Next.js
//   - Memoire browser (WebAssembly compatible)
// ============================================================

use napi_derive::napi;
use std::sync::LazyLock;
use tracing::{info, warn, error, debug};

pub mod wgpu_engine;
pub mod tensor;
pub mod matrix;
pub mod parallel;
pub mod error;

static ENGINE: LazyLock<ComputeEngineInner> = LazyLock::new(|| {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "compute_engine=info".into()),
        )
        .json()
        .init();
    info!("compute-engine initializing...");
    ComputeEngineInner::new()
});

struct ComputeEngineInner {
    wgpu: crate::wgpu_engine::WgpuEngine,
    parallel: crate::parallel::ParallelPool,
}

impl ComputeEngineInner {
    fn new() -> Self {
        Self {
            wgpu: crate::wgpu_engine::WgpuEngine::new(),
            parallel: crate::parallel::ParallelPool::new(),
        }
    }

    fn matmul_async(&self, a: &[f32], b: &[f32], dims: (usize, usize, usize)) -> Result<Vec<f32>, String> {
        self.wgpu.matmul(a, b, dims)
    }

    fn matmul_cpu(&self, a: &[f32], b: &[f32], dims: (usize, usize, usize)) -> Vec<f32> {
        self.parallel.matmul_parallel(a, b, dims)
    }

    fn convolution_async(&self, input: &[f32], kernel: &[f32], dims: (usize, usize, usize)) -> Result<Vec<f32>, String> {
        self.wgpu.convolution(input, kernel, dims)
    }

    fn convolution_cpu(&self, input: &[f32], kernel: &[f32], dims: (usize, usize, usize)) -> Vec<f32> {
        self.parallel.convolution_parallel(input, kernel, dims)
    }

    fn softmax(&self, input: &[f32]) -> Vec<f32> {
        crate::tensor::softmax(input)
    }

    fn relu(&self, input: &[f32]) -> Vec<f32> {
        crate::tensor::relu(input)
    }

    fn sigmoid(&self, input: &[f32]) -> Vec<f32> {
        crate::tensor::sigmoid(input)
    }

    fn dot_product(&self, a: &[f32], b: &[f32]) -> Result<f32, String> {
        crate::tensor::dot_product(a, b)
    }

    fn cosine_similarity(&self, a: &[f32], b: &[f32]) -> Result<f32, String> {
        crate::tensor::cosine_similarity(a, b)
    }

    fn benchmark(&self, ops: u64) -> ComputeBenchmark {
        self.wgpu.benchmark(ops)
    }
}

// ============================================================
// Types exposes aux bindings JS
// ============================================================

#[napi(object)]
#[derive(Clone)]
pub struct ComputeBenchmark {
    pub gpu_available: bool,
    pub gpu_ops_per_sec: f64,
    pub cpu_ops_per_sec: f64,
    pub total_ops: u64,
    pub gpu_time_ms: f64,
    pub cpu_time_ms: f64,
    pub speedup_ratio: f64,
    pub device_name: String,
    pub memory_available_mb: u64,
}

// ============================================================
// NAPI exports — appelables depuis TypeScript
// ============================================================

#[napi]
pub fn compute_init() -> bool {
    let _ = &*ENGINE;
    info!("compute-engine initialized successfully (WebGPU + Rayon)");
    true
}

#[napi]
pub fn compute_matmul(a: Vec<f32>, b: Vec<f32>, m: i32, n: i32, k: i32) -> Result<Vec<f32>> {
    let result = ENGINE.matmul_async(&a, &b, (m as usize, n as usize, k as usize))
        .map_err(|e| napi::Error::from_reason(e))?;
    Ok(result)
}

#[napi]
pub fn compute_convolve(input: Vec<f32>, kernel: Vec<f32>, width: i32, height: i32, channels: i32) -> Result<Vec<f32>> {
    let result = ENGINE.convolution_async(&input, &kernel, (width as usize, height as usize, channels as usize))
        .map_err(|e| napi::Error::from_reason(e))?;
    Ok(result)
}

#[napi]
pub fn compute_softmax(input: Vec<f32>) -> Vec<f32> {
    ENGINE.softmax(&input)
}

#[napi]
pub fn compute_relu(input: Vec<f32>) -> Vec<f32> {
    ENGINE.relu(&input)
}

#[napi]
pub fn compute_sigmoid(input: Vec<f32>) -> Vec<f32> {
    ENGINE.sigmoid(&input)
}

#[napi]
pub fn compute_cosine_sim(a: Vec<f32>, b: Vec<f32>) -> Result<f64> {
    let result = ENGINE.cosine_similarity(&a, &b)
        .map_err(|e| napi::Error::from_reason(e))?;
    Ok(result as f64)
}

#[napi]
pub fn compute_dot(a: Vec<f32>, b: Vec<f32>) -> Result<f64> {
    let result = ENGINE.dot_product(&a, &b)
        .map_err(|e| napi::Error::from_reason(e))?;
    Ok(result as f64)
}

#[napi]
pub fn compute_benchmark(ops: i64) -> ComputeBenchmark {
    ENGINE.benchmark(ops as u64)
}

#[napi]
pub fn compute_matmul_cpu(a: Vec<f32>, b: Vec<f32>, m: i32, n: i32, k: i32) -> Vec<f32> {
    ENGINE.matmul_cpu(&a, &b, (m as usize, n as usize, k as usize))
}

#[napi]
pub fn compute_convolve_cpu(input: Vec<f32>, kernel: Vec<f32>, width: i32, height: i32, channels: i32) -> Vec<f32> {
    ENGINE.convolution_cpu(&input, &kernel, (width as usize, height as usize, channels as usize))
}
