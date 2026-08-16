use thiserror::Error;

#[derive(Error, Debug)]
pub enum ComputeError {
    #[error("WebGPU non disponible: {0}")]
    WebGpuNotAvailable(String),
    #[error("Dimension incompatible: {0}")]
    DimensionMismatch(String),
    #[error("Erreur shader: {0}")]
    ShaderError(String),
    #[error("Erreur buffer GPU: {0}")]
    BufferError(String),
    #[error("Timeout: {0}ms")]
    Timeout(u64),
    #[error("Memoire insuffisante")]
    OutOfMemory { required: u64, available: u64 },
    #[error("Erreur interne: {0}")]
    Internal(String),
}
