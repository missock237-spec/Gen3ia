use rayon::prelude::*;

#[derive(Debug, Clone)]
pub struct Matrix {
    pub rows: usize,
    pub cols: usize,
    pub data: Vec<f32>,
}

impl Matrix {
    pub fn new(rows: usize, cols: usize, data: Vec<f32>) -> Result<Self, String> {
        if data.len() != rows * cols {
            return Err(format!("Mismatch: {}x{} need {}, got {}", rows, cols, rows*cols, data.len()));
        }
        Ok(Self { rows, cols, data })
    }
    pub fn zeros(rows: usize, cols: usize) -> Self {
        Self { rows, cols, data: vec![0.0; rows * cols] }
    }
    pub fn identity(n: usize) -> Self {
        let mut d = vec![0.0; n * n];
        for i in 0..n { d[i * n + i] = 1.0; }
        Self { rows: n, cols: n, data: d }
    }
    pub fn get(&self, r: usize, c: usize) -> f32 { self.data[r * self.cols + c] }
    pub fn set(&mut self, r: usize, c: usize, v: f32) { self.data[r * self.cols + c] = v; }
    pub fn transpose(&self) -> Self {
        let mut r = vec![0.0; self.rows * self.cols];
        r.par_chunks_mut(self.rows).enumerate().for_each(|(j, col)| {
            for i in 0..self.rows { col[i] = self.data[i * self.cols + j]; }
        });
        Self { rows: self.cols, cols: self.rows, data: r }
    }
    pub fn determinant(&self) -> Result<f32, String> {
        if self.rows != self.cols { return Err("Must be square".into()); }
        let n = self.rows;
        let mut lu = self.data.clone();
        let mut det = 1.0;
        for i in 0..n {
            let mut p = i;
            for j in (i+1)..n { if lu[j*n+i].abs() > lu[p*n+i].abs() { p = j; } }
            if p != i { for k in 0..n { lu.swap(i*n+k, p*n+k); } det = -det; }
            let pv = lu[i*n+i];
            if pv == 0.0 { return Ok(0.0); }
            det *= pv;
            for j in (i+1)..n {
                let f = lu[j*n+i] / pv;
                for k in (i+1)..n { lu[j*n+k] -= f * lu[i*n+k]; }
            }
        }
        Ok(det)
    }
}

pub fn normalize(v: &[f32]) -> Vec<f32> {
    let n: f32 = v.par_iter().map(|&x| x*x).sum::<f32>().sqrt();
    if n == 0.0 { return v.to_vec(); }
    v.par_iter().map(|&x| x / n).collect()
}
