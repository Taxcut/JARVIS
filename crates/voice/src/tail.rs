//! Two seconds of local-only capture. After a keyword is confirmed, retain only
//! the suffix after its last token plus one acoustic frame (40 ms). Never upload
//! a generic ambient pre-roll. Discard uncertain/out-of-range timestamps.
use std::collections::VecDeque;
#[derive(Default)]
pub struct WakeTail {
    samples: VecDeque<f32>,
    total: usize,
}
impl WakeTail {
    pub fn push(&mut self, frame: &[f32]) {
        self.total = self.total.saturating_add(frame.len());
        self.samples.extend(frame.iter().copied());
        while self.samples.len() > 32000 {
            self.samples.pop_front();
        }
    }
    pub fn after(&self, start: f32, last: f32) -> Vec<f32> {
        let time = start + last + 0.04;
        if !time.is_finite() || time < 0.0 {
            return Vec::new();
        }
        let end = (time * 16000.0).ceil() as usize;
        let oldest = self.total.saturating_sub(self.samples.len());
        if end < oldest || end > self.total {
            return Vec::new();
        }
        self.samples.iter().skip(end - oldest).copied().collect()
    }
    pub fn clear(&mut self) {
        self.samples.clear();
        self.total = 0;
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retains_only_the_verified_keyword_suffix() {
        let mut t = WakeTail::default();
        t.push(&vec![1.0; 16000]);
        t.push(&vec![2.0; 16000]);
        let after = t.after(0.0, 0.96);
        assert_eq!(after.len(), 16000);
        assert!(after.iter().all(|x| *x == 2.0));
        assert!(t.after(f32::NAN, 0.0).is_empty());
        assert!(t.after(9.0, 0.0).is_empty());
        t.push(&vec![3.0; 32000]);
        assert_eq!(t.samples.len(), 32000);
        assert!(t.after(0.0, 0.0).is_empty());
        t.clear();
        assert!(t.after(0.0, 0.0).is_empty());
    }
}
