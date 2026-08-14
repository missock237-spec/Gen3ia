// ============================================================
// parallel — Pool de parallelisation CPU avec Rayon
// Execution multi-coeur pour les operations sans GPU.
// ============================================================

use rayon::prelude::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use tracing::info;

pub struct ParallelPool {
    thread_count: usize,
    tasks_completed: AtomicUsize,
}

impl ParallelPool {
    pub fn new() -> Self {
        let count = rayon::current_num_threads();
        info!("ParallelPool initialized with {} threads", count);
        Self {
            thread_count: count,
            tasks_completed: AtomicUsize::new(0),
        }
    }

    pub fn thread_count(&self) -> usize {
        self.thread_count
    }

    /// Multiplication matricielle parallele (CPU multi-coeur)
    pub fn matmul_parallel(&self, a: &[f32], b: &[f32], dims: (usize, usize, usize)) -> Vec<f32> {
        let (m, n, k) = dims;
        let mut c = vec![0.0f32; m * n];

        c.par_chunks_mut(n).enumerate().for_each(|(i, row)| {
            for j in 0..n {
                let mut sum = 0.0;
                for l in 0..k {
                    sum += a[i * k + l] * b[l * n + j];
                }
                row[j] = sum;
            }
        });

        self.tasks_completed.fetch_add(1, Ordering::Relaxed);
        c
    }

    /// Convolution 2D parallele (CPU multi-coeur)
    pub fn convolution_parallel(&self, input: &[f32], kernel: &[f32], dims: (usize, usize, usize)) -> Vec<f32> {
        let (w, h, c) = dims;
        let ks = (kernel.len() as f64).sqrt() as usize;
        let pad = ks / 2;
        let out_w = w;
        let out_h = h;
        let mut output = vec![0.0f32; out_w * out_h * c];

        output.par_chunks_mut(out_w * c).enumerate().for_each(|(y, row)| {
            for x in 0..out_w {
                for ch in 0..c {
                    let mut sum = 0.0;
                    for ky in 0..ks {
                        for kx in 0..ks {
                            let ix = (x as isize + kx as isize - pad as isize)
                                .max(0).min(w as isize - 1) as usize;
                            let iy = (y as isize + ky as isize - pad as isize)
                                .max(0).min(h as isize - 1) as usize;
                            let in_idx = (iy * w + ix) * c + ch;
                            let k_idx = ky * ks + kx;
                            sum += input[in_idx] * kernel[k_idx];
                        }
                    }
                    row[x * c + ch] = sum;
                }
            }
        });

        self.tasks_completed.fetch_add(1, Ordering::Relaxed);
        output
    }

    pub fn tasks_count(&self) -> usize {
        self.tasks_completed.load(Ordering::Relaxed)
    }
}
