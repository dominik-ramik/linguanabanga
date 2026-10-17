/**
 * AdaptiveConcurrency – picks how many requests to keep in flight.
 *
 * Idea: the best concurrency is the *smallest* one that still gives (near) maximal goodput
 * (≈ bandwidth-delay-product / file size). More than that only adds queueing, risk and wasted
 * partial downloads. Too few leaves the link idle during every request round trip.
 *
 *  1. startup : double the limit each epoch while goodput improves by ≥ startupMargin.
 *  2. steady  : hold; every `probeEvery` epochs try limit×1.25 (adopt if ≥ upMargin better, and keep
 *               climbing with momentum). Probing downward is optional and OFF by default: goodput noise
 *               (±5 %) is larger than the benefit, and a too-low limit costs more than a too-high one.
 *  3. errors  : network error / timeout / 5xx / 429 above 5 % of an epoch halves the limit and blocks
 *               probing upward for a while. 404s are neutral (a missing file says nothing about load).
 *
 * Time is injected by the caller so the same class runs in the simulator and in the service worker.
 */
export class AdaptiveConcurrency {
  constructor({
    min = 2, max = 32, initial = 8,
    minEpochMs = 1000, minEpochFiles = 12, epochFilesPerSlot = 4,
    startupMargin = 1.12, upMargin = 1.10, downTolerance = 0.97,
    probeEvery = 3, blockUpEpochs = 8, probeDownEnabled = false, maxInflightSecs = 5,
  } = {}) {
    Object.assign(this, { min, max, minEpochMs, minEpochFiles, epochFilesPerSlot, startupMargin, upMargin, downTolerance, probeEvery, blockUpEpochs, probeDownEnabled, maxInflightSecs });
    this.limit = Math.max(min, Math.min(max, initial));
    this.trace = [];
    this.reset();
  }

  reset(now = null) {
    this.state = 'startup';       // startup | hold | probeUp | probeDown
    this.epochIdx = 0;
    this.bestG = 0;
    this.prevLimit = this.limit;
    this.base = null;             // smoothed goodput at the held limit
    this.holdCount = 0;
    this.heldLimit = this.limit;
    this.blockUpUntil = 0;
    this.momentum = false;
    this.ceil = this.max;
    this.ssthresh = this.max;      // growth beyond this is additive (set after an overload back-off)
    this.refractoryUntil = 0;      // errors of requests started before a back-off are stale: ignore them
    this._newEpoch(now);
  }

  _newEpoch(now) { this.ep = { start: now, bytes: 0, files: 0, errors: 0, hard: 0, severe: false, last: now }; }

  recordSuccess(bytes, now) { this._touch(now); this.ep.bytes += bytes; this.ep.files++; this.ep.last = now; this._maybeClose(now); }
  recordNeutral(now) { this._touch(now); this.ep.last = now; }            // e.g. 404
  recordError(kind, now) {                                                  // 'network' | 'timeout' | '5xx' | '429' | '503'
    if (now < this.refractoryUntil) return;
    this._touch(now); this.ep.errors++; this.ep.last = now;
    if (kind === '429' || kind === '503') { this.ep.hard++; this.ep.severe = true; }   // explicit overload signal
    this._maybeClose(now);
  }
  _touch(now) { if (this.ep.start == null) this.ep.start = now; }

  _maybeClose(now) {
    const e = this.ep, total = e.files + e.errors;
    if (e.hard >= 2) return this._close(now);                                  // react fast to explicit throttling
    if (now - e.start >= this.minEpochMs && total >= Math.max(this.minEpochFiles, this.epochFilesPerSlot * this.limit)) this._close(now);
  }

  _set(limit, why, now) {
    limit = Math.max(this.min, Math.min(this.max, this.ceil, Math.round(limit)));
    if (limit !== this.limit) this.trace.push({ t: now, limit, why });
    this.limit = limit;
  }

  _close(now) {
    const e = this.ep, dt = Math.max(1, now - e.start);
    const g = (e.bytes / dt) * 1000;                                           // goodput, bytes/s
    const errRate = e.errors / Math.max(1, e.files + e.errors);
    this.epochIdx++;

    // In-flight ceiling (Little's law): never keep more than ~maxInflightSecs of work in flight. Matters only on slow
    // links, where extra concurrency adds latency and lost partial downloads but no throughput.
    if (e.files > 0 && g > 0) this.ceil = Math.max(this.min, Math.floor((this.maxInflightSecs * g) / (e.bytes / e.files)));
    const hardRate = e.hard / Math.max(1, e.files + e.errors);
    // overload (429/503) backs off quickly; random network errors only when they are frequent (a lossy link is not an overloaded one)
    if ((e.hard >= 2 && hardRate > 0.03) || (e.errors - e.hard >= 3 && errRate > 0.15 && e.files + e.errors >= 20)) {  // multiplicative decrease
      this.ssthresh = Math.max(this.min, Math.floor(this.limit * 0.6));
      this._set(this.limit * 0.5, 'errors', now);
      this.refractoryUntil = now + Math.max(1500, 2 * (e.last - e.start) / Math.max(1, e.files + e.errors));
      this.state = 'hold'; this.heldLimit = this.limit; this.base = null; this.holdCount = 0;
      this.blockUpUntil = this.epochIdx + this.blockUpEpochs; this.momentum = false;
      return this._newEpoch(now);
    }
    if (e.files === 0) return this._newEpoch(now);

    switch (this.state) {
      case 'startup':
        if (this.bestG === 0 || g >= this.bestG * this.startupMargin) {
          this.bestG = g; this.prevLimit = this.limit;
          if (this.limit >= this.max) { this._enterHold(g); break; }
          this._set(this.limit * 2, 'startup', now);
        } else {                                                               // no gain from the last doubling: go back
          this._set(this.prevLimit, 'startup-end', now);
          this._enterHold(this.bestG);
        }
        break;
      case 'hold':
        this.base = this.base == null ? g : 0.5 * this.base + 0.5 * g;
        this.holdCount++;
        if (this.holdCount >= this.probeEvery && this.epochIdx >= this.blockUpUntil && this.limit < this.max) this._startProbe('probeUp', now);
        else if (this.probeDownEnabled && this.holdCount >= this.probeEvery && this.limit > this.min && this.epochIdx >= this.blockUpUntil) this._startProbe('probeDown', now);
        break;
      case 'probeUp':
        if (g >= this.base * this.upMargin) { this.base = g; this.heldLimit = this.limit; this.holdCount = 0; this.momentum = true;
          if (this.limit < this.max) { this._set(this.limit < this.ssthresh ? Math.min(this.ssthresh, this.limit * 1.5) : this.limit + 1, 'momentum', now); this.state = 'probeUp'; } else this._enterHold(g); }
        else {
          this.momentum = false; this._set(this.heldLimit, 'revert-up', now);
          if (this.probeDownEnabled) this._startProbe('probeDown', now); else this._enterHold(this.base);
        }
        break;
      case 'probeDown':
        if (g >= this.base * this.downTolerance) { this.heldLimit = this.limit; this.base = Math.max(g, this.base * 0.9); this._set(this.limit, 'adopt-down', now); }
        else this._set(this.heldLimit, 'revert-down', now);
        this._enterHold(this.base);
        break;
    }
    if (this.limit > this.ceil) this._set(this.ceil, 'latency-ceiling', now);
    this._newEpoch(now);
  }

  _enterHold(g) { this.state = 'hold'; this.heldLimit = this.limit; this.base = g; this.holdCount = 0; }

  _startProbe(kind, now) {
    this.state = kind;
    if (kind === 'probeUp') this._set(this.limit >= this.ssthresh ? this.limit + 1 : Math.max(this.limit + 1, Math.min(this.ssthresh, this.limit * 1.25)), 'probe-up', now);
    else if (this.limit > this.min) this._set(Math.min(this.limit - 1, this.limit * 0.8), 'probe-down', now);
    else { this.state = 'hold'; this.holdCount = 0; }
  }
}
