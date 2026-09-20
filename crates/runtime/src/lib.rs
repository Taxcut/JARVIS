//! Runtime contract only: no background service, execution, device keys or OS access.
#[derive(Debug, PartialEq, Eq)]
pub enum RuntimeState {
    NotConfigured,
}
#[derive(Debug, PartialEq, Eq)]
pub struct RuntimeStatus {
    pub protocol_version: u32,
    pub state: RuntimeState,
    pub execution_available: bool,
}
pub fn status() -> RuntimeStatus {
    RuntimeStatus {
        protocol_version: 1,
        state: RuntimeState::NotConfigured,
        execution_available: false,
    }
}
#[cfg(test)]
mod tests {
    #[test]
    fn no_execution_before_runtime_implementation() {
        let status = super::status();
        assert!(!status.execution_available);
        assert_eq!(status.state, super::RuntimeState::NotConfigured);
        assert_eq!(status.protocol_version, 1);
    }
}
