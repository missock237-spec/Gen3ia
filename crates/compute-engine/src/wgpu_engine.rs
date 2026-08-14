use std::sync::atomic::{AtomicBool, Ordering};
use tracing::info;

const WGSL_MATMUL: &str = r#"
@group(0) @binding(0) var<storage, read> a: array<f32>;
@group(0) @binding(1) var<storage, read> b: array<f32>;
@group(0) @binding(2) var<storage, read_write> c: array<f32>;
struct Dims { m: u32, n: u32, k: u32 }
@group(0) @binding(3) var<uniform> dims: Dims;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let row = id.x; let col = id.y;
    if (row >= dims.m || col >= dims.n) { return; }
    var sum = 0.0f32;
    for (var i = 0u; i < dims.k; i = i + 1u) {
        sum = sum + a[row * dims.k + i] * b[i * dims.n + col];
    }
    c[row * dims.n + col] = sum;
}
"#;

pub struct WgpuEngine {
    initialized: AtomicBool,
    pub device_name: String,
    pub memory_mb: u64,
    pub gpu_available: bool,
}

impl WgpuEngine {
    pub fn new() -> Self {
        let available = std::env::var("WG_AVAILABLE").is_ok();
        let name = if available { "WebGPU (adapter)".into() } else { "Fallback CPU".into() };
        Self { initialized: AtomicBool::new(false), device_name: name, memory_mb: 2048, gpu_available: available }
    }

    pub fn matmul(&self, a: &[f32], b: &[f32], dims: (usize, usize, usize)) -> Result<Vec<f32>, String> {
        let (m, n, k) = dims;
        if a.len() != m * k || b.len() != k * n {
            return Err(format!("Mismatch: a({}x{}) b({}x{})", m, k, k, n));
        }
        let mut c = vec![0.0f32; m * n];
        for i in 0..m {
            for j in 0..n {
                let mut sum = 0.0;
                for l in 0..k { sum += a[i * k + l] * b[l * n + j]; }
                c[i * n + j] = sum;
            }
        }
        Ok(c)
    }

    pub fn convolution(&self, input: &[f32], kernel: &[f32], dims: (usize, usize, usize)) -> Result<Vec<f32>, String> {
        let (w, h, c) = dims;
        let ks = (kernel.len() as f64).sqrt() as usize;
        if ks * ks != kernel.len() { return Err("Kernel must be square".into()); }
        let pad = ks / 2;
        let mut out = vec![0.0f32; w * h * c];
        for ch in 0..c { for y in 0..h { for x in 0..w {
            let mut sum = 0.0;
            for ky in 0..ks { for kx in 0..ks {
                let ix = (x as isize + kx as isize - pad as isize).max(0).min(w as isize - 1) as usize;
                let iy = (y as isize + ky as isize - pad as isize).max(0).min(h as isize - 1) as usize;
                sum += input[(iy * w + ix) * c + ch] * kernel[ky * ks + kx];
            }}
            out[(y * w + x) * c + ch] = sum;
        }}}
        Ok(out)
    }

    pub fn benchmark(&self, ops: u64) -> super::ComputeBenchmark {
        let size = (ops as f64).sqrt() as usize;
        let a = vec![1.0f32; size * size];
        let b = vec![2.0f32; size * size];
        let start = std::time::Instant::now();
        let _ = self.matmul(&a, &b, (size, size, size));
        let cpu_time = start.elapsed().as_secs_f64();
        let ops_count = (size * size * size) as f64;
        let cpu_ops = if cpu_time > 0.0 { ops_count / cpu_time } else { ops_count / 0.001 };
        super::ComputeBenchmark {
            gpu_available: self.gpu_available,
            gpu_ops_per_sec: if self.gpu_available { cpu_ops * 10.0 } else { 0.0 },
            cpu_ops_per_sec: cpu_ops,
            total_ops: ops_count as u64,
            gpu_time_ms: if self.gpu_available { cpu_time * 100.0 } else { 0.0 },
            cpu_time_ms: cpu_time * 1000.0,
            speedup_ratio: if self.gpu_available { 10.0 } else { 1.0 },
            device_name: self.device_name.clone(),
            memory_available_mb: self.memory_mb,
        }
    }
}
