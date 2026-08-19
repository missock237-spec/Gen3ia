// ============================================================
// tensor — Operations tensorielles (softmax, relu, sigmoid, dot, cos)
// Utilise Rayon pour parallelisation CPU.
// ============================================================

use rayon::prelude::*;

pub fn softmax(input: &[f32]) -> Vec<f32> {
    let max = input.par_iter().cloned().reduce(f32::MAX, f32::max);
    let exp: Vec<f32> = input.par_iter().map(|&x| (x - max).exp()).collect();
    let sum: f32 = exp.par_iter().sum();
    if sum == 0.0 { return vec![0.0; input.len()]; }
    exp.par_iter().map(|&x| x / sum).collect()
}

pub fn relu(input: &[f32]) -> Vec<f32> {
    input.par_iter().map(|&x| if x > 0.0 { x } else { 0.0 }).collect()
}

pub fn sigmoid(input: &[f32]) -> Vec<f32> {
    input.par_iter().map(|&x| 1.0 / (1.0 + (-x).exp())).collect()
}

pub fn dot_product(a: &[f32], b: &[f32]) -> Result<f32, String> {
    if a.len() != b.len() {
        return Err(format!("Dot product dimension mismatch: {} vs {}", a.len(), b.len()));
    }
    Ok(a.par_iter().zip(b.par_iter()).map(|(x, y)| x * y).sum())
}

pub fn cosine_similarity(a: &[f32], b: &[f32]) -> Result<f32, String> {
    if a.len() != b.len() {
        return Err(format!("Cosine similarity dimension mismatch: {} vs {}", a.len(), b.len()));
    }
    let dot: f32 = a.par_iter().zip(b.par_iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.par_iter().map(|&x| x * x).sum();
    let norm_b: f32 = b.par_iter().map(|&x| x * x).sum();
    let denom = (norm_a * norm_b).sqrt();
    if denom == 0.0 { return Ok(0.0); }
    Ok(dot / denom)
}
