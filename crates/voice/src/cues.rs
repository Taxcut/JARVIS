//! Original, quiet additive tones. Generated locally; no sampled media or speech.
#[derive(Clone, Copy)]
pub enum Cue {
    Boot,
    Wake,
    Listening,
    Alert,
}
pub fn render(cue: Cue) -> Vec<f32> {
    let (duration, a, b) = match cue {
        Cue::Boot => (0.36, 220.0, 330.0),
        Cue::Wake => (0.12, 440.0, 660.0),
        Cue::Listening => (0.09, 660.0, 880.0),
        Cue::Alert => (0.24, 330.0, 415.3),
    };
    let n = (duration * 24000.0) as usize;
    (0..n)
        .map(|i| {
            let t = i as f32 / 24000.0;
            let envelope = (std::f32::consts::PI * i as f32 / (n - 1) as f32)
                .sin()
                .powi(2);
            0.055
                * envelope
                * ((std::f32::consts::TAU * a * t).sin()
                    + 0.35 * (std::f32::consts::TAU * b * t).sin())
        })
        .collect()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cues_are_short_quiet_and_click_free() {
        for cue in [Cue::Boot, Cue::Wake, Cue::Listening, Cue::Alert] {
            let samples = render(cue);
            assert!(samples.len() <= 8640);
            assert!(samples.iter().all(|x| x.is_finite() && x.abs() < 0.075));
            assert!(samples[0].abs() < 0.00001 && samples.last().unwrap().abs() < 0.00001);
        }
    }
}
