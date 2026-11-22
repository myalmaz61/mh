/** Pure PWA readiness checks (no claims about actual connectivity). */
export function pwaAssessment(input){
  const supported=!!input?.supported;
  return {
    supported,
    controlled:supported&&!!input.controlled,
    waiting:supported&&!!input.waiting,
    shellCached:supported&&!!input.shellCached,
    offlineShellReady:supported&&!!input.controlled&&!!input.shellCached,
    onlineReported:!!input?.onlineReported
  };
}
