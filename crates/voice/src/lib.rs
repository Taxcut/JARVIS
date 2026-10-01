//! Native voice only. No execution, file, process or arbitrary URL interface.
pub mod state;
pub use state::*;
pub mod audio;
pub mod models;

pub mod provider;

pub mod controller;

mod tail;

mod cues;
mod permission;
