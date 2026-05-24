import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { Activity, Zap, Clock, AlertCircle, Info, Power } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function Analytics({ deviceId, token }) {
  const [data, setData] = useState([]);
  const [actualEnergyData, setActualEnergyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingEnergy, setLoadingEnergy] = useState(false);
  const [error, setError] = useState(null);

  // Custom date range defaults (last 30 days)
  const todayStr = new Date().toISOString().split('T')[0];
  const defaultStartStr = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [customStartDate, setCustomStartDate] = useState(defaultStartStr);
  const [customEndDate, setCustomEndDate] = useState(todayStr);

  // Toggles for the main stacked bar chart
  const [timeframe, setTimeframe] = useState('24h'); // '24h', '7d', '12m', 'custom'
  const [metric, setMetric] = useState('hours'); // 'hours', 'kWh', 'cost'
  const [tariff, setTariff] = useState({ rate: 6.50, state: 'National Average', city: 'India', source: 'default' });
  const [loadingTariff, setLoadingTariff] = useState(false);
  const [isEditingRate, setIsEditingRate] = useState(false);
  const [customRateInput, setCustomRateInput] = useState('');

  // Timeline filters and scroll reference
  const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'controls', 'savings', 'alerts'
  const [selectedDayFilter, setSelectedDayFilter] = useState(null);
  const timelineRef = useRef(null);

  // Helper date formatters used for matching actual energy data
  const formatDDMMYYYY = (date) => {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}${m}${y}`;
  };

  const formatMMYYYY = (date) => {
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${m}${y}`;
  };

  useEffect(() => {
    if (!deviceId || !token) return;

    const fetchTariff = async () => {
      setLoadingTariff(true);
      try {
        const response = await fetch(`${API_BASE}/api/devices/${deviceId}/tariff`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const tariffData = await response.json();
          const savedRate = localStorage.getItem(`tariff_rate_${deviceId}`);
          if (savedRate) {
            tariffData.rate = parseFloat(savedRate);
            tariffData.isCustom = true;
          }
          setTariff(tariffData);
        }
      } catch (err) {
        console.warn("[Analytics] Failed to fetch tariff:", err.message);
        const savedRate = localStorage.getItem(`tariff_rate_${deviceId}`);
        if (savedRate) {
          setTariff(prev => ({
            ...prev,
            rate: parseFloat(savedRate),
            isCustom: true
          }));
        }
      } finally {
        setLoadingTariff(false);
      }
    };

    fetchTariff();
  }, [deviceId, token]);

  useEffect(() => {
    if (!deviceId) return;

    const fetchAnalyticsAndEnergy = async () => {
      setLoading(true);
      setLoadingEnergy(true);
      setError(null);

      const headers = { 'Authorization': `Bearer ${token}` };

      let analyticsUrl = `${API_BASE}/api/analytics?deviceId=${deviceId}`;
      let energyUrl = `${API_BASE}/api/analytics/energy?deviceId=${deviceId}`;

      if (timeframe === 'custom') {
        analyticsUrl += `&startDate=${customStartDate}&endDate=${customEndDate}`;
        energyUrl += `&timeframe=custom&startDate=${customStartDate}&endDate=${customEndDate}`;
      } else {
        // Determine how many days of history we need to request
        let queryDays = 7;
        if (timeframe === '24h') queryDays = 1;
        else if (timeframe === '12m') queryDays = 365;
        analyticsUrl += `&days=${queryDays}`;
        energyUrl += `&timeframe=${timeframe}`;
      }

      // Promise to fetch event-based session logs
      const fetchAnalyticsPromise = fetch(analyticsUrl, { headers })
        .then(async res => {
          if (res.status === 503) {
            throw new Error("Firebase is not initialized on the backend. Please provide the serviceAccountKey.");
          }
          if (!res.ok) throw new Error("Failed to fetch analytics");
          const result = await res.json();
          return result.sessions.map(s => ({
            time: new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            temperature: s.temperature,
            roomTemperature: s.roomTemperature,
            wattage: s.wattage || 0,
            powerMode: s.powerMode || 'off',
            hvacMode: s.hvacMode || 'cool',
            fanMode: s.fanMode || 'auto',
            presetMode: s.presetMode || 'none',
            convertiMode: s.convertiMode !== undefined ? s.convertiMode : 0,
            rawDate: new Date(s.timestamp),
            timestamp: s.timestamp
          })).sort((a, b) => a.rawDate - b.rawDate);
        });

      // Promise to fetch actual energy units from MirAIe API
      const fetchEnergyPromise = fetch(energyUrl, { headers })
        .then(async res => {
          if (!res.ok) throw new Error("Failed to fetch actual energy data");
          const result = await res.json();
          return result.consumption || [];
        });

      try {
        const [chartData, energyData] = await Promise.all([
          fetchAnalyticsPromise,
          fetchEnergyPromise.catch(err => {
            console.warn("[Analytics] actual energy fetch failed:", err.message);
            return []; // Fail-safe fallback to event calculations
          })
        ]);

        setData(chartData);
        setActualEnergyData(energyData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
        setLoadingEnergy(false);
      }
    };

    fetchAnalyticsAndEnergy();
  }, [deviceId, token, timeframe, customStartDate, customEndDate]);

  // Helper to format values in Tooltip/Stats with minutes & hours dynamically
  const formatMetricValue = (value, metricType) => {
    if (metricType === 'hours') {
      const totalMins = Math.round(value * 60);
      if (totalMins === 0) return '0 mins';
      if (totalMins < 60) return `${totalMins} mins`;
      const hrs = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      return mins > 0 ? `${hrs} hrs ${mins} mins` : `${hrs} hrs`;
    } else if (metricType === 'cost') {
      return `₹${value.toFixed(2)}`;
    } else {
      return `${value.toFixed(2)} kWh`;
    }
  };

  // ─── Stacked Bar Chart Aggregations ────────────────────────────────────────

  const getCategory = (segment) => {
    const preset = segment.presetMode || 'none';
    const wattage = segment.wattage || 0;

    // Eco Mode: mapped from Panasonic's "eco" preset
    if (preset === 'eco') {
      return 'eco';
    }
    // Powerful Mode: mapped from Panasonic's "boost" preset or high wattage load (>1200W)
    else if (preset === 'boost' || preset === 'powerful' || wattage > 1200) {
      return 'powerful';
    }
    // Normal Mode: standard operation (cooling/dry/fan/auto without presets active)
    else {
      return 'normal';
    }
  };

  const getOverlappingDuration = (segStart, segEnd, bucketStart, bucketEnd) => {
    const overlapStart = segStart > bucketStart ? segStart : bucketStart;
    const overlapEnd = segEnd < bucketEnd ? segEnd : bucketEnd;

    if (overlapStart < overlapEnd) {
      return overlapEnd - overlapStart;
    }
    return 0;
  };

  const buildAllHistorySegments = (events) => {
    if (!events || events.length === 0) return [];

    const sorted = [...events].sort((a, b) => a.rawDate - b.rawDate);

    const segments = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const startEvent = sorted[i];
      const endEvent = sorted[i + 1];
      const durationMs = endEvent.rawDate - startEvent.rawDate;

      if (durationMs > 0) {
        segments.push({
          start: startEvent.rawDate,
          end: endEvent.rawDate,
          durationMs,
          powerMode: startEvent.powerMode,
          hvacMode: startEvent.hvacMode,
          temperature: startEvent.temperature,
          fanMode: startEvent.fanMode,
          presetMode: startEvent.presetMode,
          convertiMode: startEvent.convertiMode !== undefined ? startEvent.convertiMode : 0,
          wattage: startEvent.wattage || 0
        });
      }
    }

    const lastEvent = sorted[sorted.length - 1];
    const now = new Date();
    const finalDurationMs = now - lastEvent.rawDate;
    if (finalDurationMs > 0) {
      segments.push({
        start: lastEvent.rawDate,
        end: now,
        durationMs: finalDurationMs,
        powerMode: lastEvent.powerMode,
        hvacMode: lastEvent.hvacMode,
        temperature: lastEvent.temperature,
        fanMode: lastEvent.fanMode,
        presetMode: lastEvent.presetMode,
        convertiMode: lastEvent.convertiMode !== undefined ? lastEvent.convertiMode : 0,
        wattage: lastEvent.wattage || 0
      });
    }

    return segments;
  };

  const generate24HourBuckets = () => {
    const buckets = [];
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    for (let h = 0; h < 24; h++) {
      const bStart = new Date(startOfDay);
      bStart.setHours(h, 0, 0, 0);

      const bEnd = new Date(startOfDay);
      bEnd.setHours(h + 1, 0, 0, 0);

      const hourLabel = bStart.toLocaleTimeString([], { hour: 'numeric', hour12: true });

      buckets.push({
        start: bStart,
        end: bEnd,
        label: hourLabel,
        eco: 0,
        normal: 0,
        powerful: 0
      });
    }
    return buckets;
  };

  const generate7DayBuckets = () => {
    const buckets = [];
    const now = new Date();

    for (let d = 6; d >= 0; d--) {
      const bStart = new Date();
      bStart.setDate(now.getDate() - d);
      bStart.setHours(0, 0, 0, 0);

      const bEnd = new Date(bStart);
      bEnd.setHours(23, 59, 59, 999);

      const label = bStart.toLocaleDateString([], { weekday: 'short', day: 'numeric' });

      buckets.push({
        start: bStart,
        end: bEnd,
        label,
        eco: 0,
        normal: 0,
        powerful: 0
      });
    }
    return buckets;
  };

  const generate12MonthBuckets = () => {
    const buckets = [];
    const now = new Date();

    for (let m = 11; m >= 0; m--) {
      const bStart = new Date(now.getFullYear(), now.getMonth() - m, 1, 0, 0, 0, 0);
      const bEnd = new Date(now.getFullYear(), now.getMonth() - m + 1, 0, 23, 59, 59, 999);

      const label = bStart.toLocaleDateString([], { month: 'short' });

      buckets.push({
        start: bStart,
        end: bEnd,
        label,
        eco: 0,
        normal: 0,
        powerful: 0
      });
    }
    return buckets;
  };

  const generateCustomDayBuckets = (startStr, endStr) => {
    const buckets = [];
    const start = new Date(startStr);
    const end = new Date(endStr);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    let current = new Date(start);
    while (current <= end) {
      const bStart = new Date(current);
      bStart.setHours(0, 0, 0, 0);
      const bEnd = new Date(current);
      bEnd.setHours(23, 59, 59, 999);
      const label = bStart.toLocaleDateString([], { weekday: 'short', day: 'numeric' });

      buckets.push({
        start: bStart,
        end: bEnd,
        label,
        eco: 0,
        normal: 0,
        powerful: 0
      });

      current.setDate(current.getDate() + 1);
    }
    return buckets;
  };

  const generateCustomMonthBuckets = (startStr, endStr) => {
    const buckets = [];
    const start = new Date(startStr);
    const end = new Date(endStr);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    let current = new Date(start);
    while (current <= end) {
      const bStart = new Date(current.getFullYear(), current.getMonth(), 1, 0, 0, 0, 0);
      const bEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59, 999);
      const label = bStart.toLocaleDateString([], { month: 'short', year: '2-digit' });

      buckets.push({
        start: bStart,
        end: bEnd,
        label,
        eco: 0,
        normal: 0,
        powerful: 0
      });

      current.setMonth(current.getMonth() + 1);
    }
    return buckets;
  };

  const getCustomRangeDiffDays = () => {
    const start = new Date(customStartDate);
    const end = new Date(customEndDate);
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getAggregatedData = () => {
    let buckets = [];
    if (timeframe === '24h') {
      buckets = generate24HourBuckets();
    } else if (timeframe === '7d') {
      buckets = generate7DayBuckets();
    } else if (timeframe === '12m') {
      buckets = generate12MonthBuckets();
    } else if (timeframe === 'custom') {
      const diff = getCustomRangeDiffDays();
      if (diff <= 31) {
        buckets = generateCustomDayBuckets(customStartDate, customEndDate);
      } else {
        buckets = generateCustomMonthBuckets(customStartDate, customEndDate);
      }
    }

    const segments = buildAllHistorySegments(data);

    buckets.forEach(bucket => {
      // 1. Calculate estimated segments for this bucket
      let estEco = 0;
      let estNormal = 0;
      let estPowerful = 0;

      segments.forEach(seg => {
        const overlapMs = getOverlappingDuration(seg.start, seg.end, bucket.start, bucket.end);
        if (overlapMs <= 0) return;
        if (seg.powerMode !== 'on') return;

        const durationHours = overlapMs / (1000 * 60 * 60);
        let value = 0;

        if (metric === 'hours') {
          value = durationHours;
        } else {
          const wattage = seg.wattage || 1000;
          value = (wattage * durationHours) / 1000;
        }

        const category = getCategory(seg);
        if (category === 'eco') {
          estEco += value;
        } else if (category === 'powerful') {
          estPowerful += value;
        } else {
          estNormal += value;
        }
      });

      // 2. If metric is kWh or cost, scale estimated values to match the actual units usage if available
      if ((metric === 'kWh' || metric === 'cost') && timeframe !== '24h') {
        const isMonthly = timeframe === '12m' || (timeframe === 'custom' && getCustomRangeDiffDays() > 31);
        const dateKey = isMonthly ? formatMMYYYY(bucket.start) : formatDDMMYYYY(bucket.start);
        const actualMatch = actualEnergyData.find(item => item.dateKey === dateKey);

        if (actualMatch) {
          const actualTotal = actualMatch.power;
          const estTotal = estEco + estNormal + estPowerful;

          if (estTotal > 0) {
            const scale = actualTotal / estTotal;
            bucket.eco = estEco * scale;
            bucket.normal = estNormal * scale;
            bucket.powerful = estPowerful * scale;
          } else {
            // If we estimated 0 but actual is > 0, put everything in normal
            bucket.eco = 0;
            bucket.normal = actualTotal;
            bucket.powerful = 0;
          }
        } else {
          // No actual data found, use estimated values directly
          bucket.eco = estEco;
          bucket.normal = estNormal;
          bucket.powerful = estPowerful;
        }
      } else if ((metric === 'kWh' || metric === 'cost') && timeframe === '24h') {
        // For 24h hourly, we scale the whole day's hours to match today's actual total
        const todayStr = formatDDMMYYYY(new Date());
        const todayActual = actualEnergyData.find(item => item.dateKey === todayStr);
        if (todayActual) {
          // Calculate total estimated for the whole 24h
          let totalEst24h = 0;
          buckets.forEach(b => {
            segments.forEach(seg => {
              const overlapMs = getOverlappingDuration(seg.start, seg.end, b.start, b.end);
              if (overlapMs <= 0 || seg.powerMode !== 'on') return;
              totalEst24h += ((seg.wattage || 1000) * overlapMs / (1000 * 60 * 60)) / 1000;
            });
          });

          if (totalEst24h > 0) {
            const scale = todayActual.power / totalEst24h;
            bucket.eco = estEco * scale;
            bucket.normal = estNormal * scale;
            bucket.powerful = estPowerful * scale;
          } else {
            bucket.eco = estEco;
            bucket.normal = estNormal;
            bucket.powerful = estPowerful;
          }
        } else {
          bucket.eco = estEco;
          bucket.normal = estNormal;
          bucket.powerful = estPowerful;
        }
      } else {
        // metric is hours, just use calculated values
        bucket.eco = estEco;
        bucket.normal = estNormal;
        bucket.powerful = estPowerful;
      }

      // 3. If metric is cost, multiply by tariff rate
      if (metric === 'cost') {
        bucket.eco = bucket.eco * tariff.rate;
        bucket.normal = bucket.normal * tariff.rate;
        bucket.powerful = bucket.powerful * tariff.rate;
      }

      bucket.eco = parseFloat(bucket.eco.toFixed(2));
      bucket.normal = parseFloat(bucket.normal.toFixed(2));
      bucket.powerful = parseFloat(bucket.powerful.toFixed(2));
    });

    return buckets;
  };

  // Calculate totals dynamically for the active timeframe
  const getTimeframeTotals = () => {
    let totalMs = 0;

    const segments = buildAllHistorySegments(data);
    let buckets = [];
    if (timeframe === '24h') {
      buckets = generate24HourBuckets();
    } else if (timeframe === '7d') {
      buckets = generate7DayBuckets();
    } else if (timeframe === '12m') {
      buckets = generate12MonthBuckets();
    } else if (timeframe === 'custom') {
      const diff = getCustomRangeDiffDays();
      if (diff <= 31) {
        buckets = generateCustomDayBuckets(customStartDate, customEndDate);
      } else {
        buckets = generateCustomMonthBuckets(customStartDate, customEndDate);
      }
    }

    const timeframeStart = buckets[0].start;
    const timeframeEnd = buckets[buckets.length - 1].end;

    segments.forEach(seg => {
      const overlapMs = getOverlappingDuration(seg.start, seg.end, timeframeStart, timeframeEnd);
      if (overlapMs <= 0) return;
      if (seg.powerMode !== 'on') return;
      totalMs += overlapMs;
    });

    const hours = totalMs / (1000 * 60 * 60);

    // Get actual or estimated kWh
    let kWh = 0;
    if (timeframe === '24h') {
      const todayStr = formatDDMMYYYY(new Date());
      const todayActual = actualEnergyData.find(item => item.dateKey === todayStr);
      if (todayActual) {
        kWh = todayActual.power;
      } else {
        // Fallback to estimated
        let estKWh = 0;
        segments.forEach(seg => {
          const overlapMs = getOverlappingDuration(seg.start, seg.end, timeframeStart, timeframeEnd);
          if (overlapMs <= 0 || seg.powerMode !== 'on') return;
          const durationHours = overlapMs / (1000 * 60 * 60);
          estKWh += ((seg.wattage || 1000) * durationHours) / 1000;
        });
        kWh = estKWh;
      }
    } else {
      // For 7d, 12m, and custom ranges, sum the actual values of all matching buckets
      let totalActual = 0;
      let hasActual = false;
      const isMonthly = timeframe === '12m' || (timeframe === 'custom' && getCustomRangeDiffDays() > 31);

      buckets.forEach(bucket => {
        const dateKey = isMonthly ? formatMMYYYY(bucket.start) : formatDDMMYYYY(bucket.start);
        const match = actualEnergyData.find(item => item.dateKey === dateKey);
        if (match) {
          totalActual += match.power;
          hasActual = true;
        }
      });

      if (hasActual) {
        kWh = totalActual;
      } else {
        // Fallback to estimated
        let estKWh = 0;
        segments.forEach(seg => {
          const overlapMs = getOverlappingDuration(seg.start, seg.end, timeframeStart, timeframeEnd);
          if (overlapMs <= 0 || seg.powerMode !== 'on') return;
          const durationHours = overlapMs / (1000 * 60 * 60);
          estKWh += ((seg.wattage || 1000) * durationHours) / 1000;
        });
        kWh = estKWh;
      }
    }

    const cost = (kWh * tariff.rate).toFixed(2);
    return { hours, kWh: parseFloat(kWh).toFixed(2), cost };
  };

  // Custom Tooltip component to improve UX by filtering 0 values
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const activeItems = payload.filter(item => item.value > 0);

      if (activeItems.length === 0) {
        return (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-2xl">
            <p className="text-[11px] font-bold text-slate-200 mb-1">{label}</p>
            <p className="text-[10px] text-slate-500 font-medium">AC was Off / Inactive</p>
          </div>
        );
      }

      // Sum all values to display total
      const totalVal = payload.reduce((sum, item) => sum + (item.value || 0), 0);

      return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-2xl space-y-1.5 min-w-[160px]">
          <p className="text-[11px] font-bold text-slate-200 border-b border-slate-800/80 pb-1 mb-1">{label}</p>
          {activeItems.map((item, idx) => {
            const dotColor = item.name === 'eco' ? 'bg-emerald-500' : item.name === 'normal' ? 'bg-blue-500' : 'bg-red-500';
            const displayName = item.name === 'eco' ? 'Eco Mode' : item.name === 'normal' ? 'Normal Mode' : 'Powerful Mode';
            return (
              <div key={idx} className="flex justify-between items-center gap-4 text-[10px] font-semibold">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                  {displayName}
                </span>
                <span className="text-slate-200 font-bold">{formatMetricValue(item.value, metric)}</span>
              </div>
            );
          })}
          <div className="border-t border-slate-800/80 pt-1.5 mt-1.5 flex justify-between items-center gap-4 text-[10px] font-bold">
            <span className="text-slate-350">Total</span>
            <span className="text-slate-100">{formatMetricValue(totalVal, metric)}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  // ─── Vertical Event Timeline Generator ─────────────────────────────────────

  const generateTimelineEvents = (events) => {
    if (!events || events.length === 0) return [];

    // Sort ascending
    const sorted = [...events].sort((a, b) => a.rawDate - b.rawDate);
    const timelineEvents = [];

    for (let i = 0; i < sorted.length; i++) {
      const event = sorted[i];
      const prev = i > 0 ? sorted[i - 1] : null;
      const timeStr = event.rawDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = event.rawDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

      let title = "";
      let desc = "";
      let category = "controls"; // "controls", "automations", "alerts", "savings"
      let badge = "Manual"; // "Manual", "Automation", "Alert", "Energy"

      const isConverti = event.convertiMode > 0;

      // 1. Power State Change
      if (!prev || event.powerMode !== prev.powerMode) {
        if (event.powerMode === 'on') {
          title = "AC Turned On";
          const modeUpper = event.hvacMode ? event.hvacMode.toUpperCase() : 'COOL';
          desc = `Mode: ${modeUpper} | Target: ${event.temperature}°C | Fan: ${event.fanMode?.toUpperCase() || 'AUTO'}`;
          if (isConverti) {
            desc += ` | Convertible Capacity: ${event.convertiMode}%`;
          }
          category = "controls";
          badge = "Manual";
        } else {
          title = "AC Turned Off";
          desc = "AC shut down safely.";
          category = "controls";
          badge = "Manual";
        }
      }
      // 2. Preset Mode Change
      else if (event.presetMode !== prev.presetMode) {
        if (event.presetMode === 'eco') {
          title = "Eco Mode Activated";
          desc = `Target shifted to 26°C for saving energy. Live power draw: ${event.wattage}W.`;
          category = "savings";
          badge = "Energy";
        } else if (event.presetMode === 'boost') {
          title = "Powerful Mode Activated";
          desc = "Compressor speed boosted for rapid cooling.";
          category = "controls";
          badge = "Manual";
        } else if (event.presetMode === 'clean') {
          title = "Nanoe-G Purifier Activated";
          desc = "Air purification cycle initiated (nanoe-G technology).";
          category = "automations";
          badge = "Automation";
        } else if (event.presetMode === 'none') {
          title = "Preset Cleared";
          desc = `Returned to standard settings. Target: ${event.temperature}°C.`;
          category = "controls";
          badge = "Manual";
        }
      }
      // 3. Convertible Mode Change
      else if (event.convertiMode !== prev.convertiMode) {
        if (event.convertiMode > 0) {
          title = `Convertible Capacity set to ${event.convertiMode}%`;
          desc = `Compressor power ceiling set to ${event.convertiMode}% for energy conservation. Current draw: ${event.wattage}W. [Temp: ${event.temperature}°C | Fan: ${event.fanMode.toUpperCase()}]`;
          category = "savings";
          badge = "Energy";
        } else {
          title = "Capacity Set to Normal (100%)";
          desc = `Returned to standard 100% capacity mode. Live draw: ${event.wattage}W.`;
          category = "controls";
          badge = "Manual";
        }
      }
      // 4. Temp Change
      else if (event.temperature !== prev.temperature && event.powerMode === 'on') {
        title = `Temperature Set to ${event.temperature}°C`;
        desc = `Target adjusted from ${prev.temperature}°C to ${event.temperature}°C.`;
        if (isConverti) {
          desc += ` [Convertible Capacity: ${event.convertiMode}%]`;
        }
        category = "controls";
        badge = "Manual";
      }
      // 5. HVAC Mode Change
      else if (event.hvacMode !== prev.hvacMode && event.powerMode === 'on') {
        title = `HVAC Mode changed to ${event.hvacMode.toUpperCase()}`;
        desc = `Target temperature is ${event.temperature}°C with ${event.fanMode} fan.`;
        category = "controls";
        badge = "Manual";
      }
      // 6. Power load warning
      else if (event.wattage > 1500 && (!prev || prev.wattage <= 1500)) {
        title = "High Power Load Detected";
        desc = `AC running under heavy load drawing ${event.wattage}W. Target: ${event.temperature}°C.`;
        category = "alerts";
        badge = "Alert";
      }
      // 7. Idle Compressor
      else if (event.powerMode === 'on' && event.wattage > 0 && event.wattage < 150 && (!prev || prev.wattage >= 150)) {
        title = "Compressor Cycled Idle";
        desc = `Target temperature reached. Compressor entering low-power maintenance mode (${event.wattage}W).`;
        category = "automations";
        badge = "Automation";
      }

      if (title) {
        timelineEvents.push({
          id: event.id || Math.random().toString(36).substr(2, 9),
          time: timeStr,
          dateStr,
          rawDate: event.rawDate,
          title,
          desc,
          category,
          badge
        });
      }
    }

    return timelineEvents.sort((a, b) => b.rawDate - a.rawDate);
  };

  const getFilteredTimelineEvents = () => {
    const rawEvents = generateTimelineEvents(data);
    let filtered = rawEvents;

    // 1. Filter by category pills
    if (activeFilter === 'alerts') {
      filtered = filtered.filter(e => e.category === 'alerts');
    } else if (activeFilter === 'savings') {
      filtered = filtered.filter(e => e.category === 'savings');
    } else if (activeFilter === 'controls') {
      filtered = filtered.filter(e => e.category === 'controls' || e.category === 'automations');
    }

    // 2. Filter by clicked graph day
    if (selectedDayFilter) {
      const filterStart = new Date(selectedDayFilter.start);
      const filterEnd = new Date(selectedDayFilter.end);
      filtered = filtered.filter(e => e.rawDate >= filterStart && e.rawDate <= filterEnd);
    }

    return filtered;
  };

  const groupEventsByDate = (eventsList) => {
    const groups = {};
    const todayStr = new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

    eventsList.forEach(event => {
      let groupName = event.dateStr;
      if (event.dateStr === todayStr) {
        groupName = "Today";
      } else if (event.dateStr === yesterdayStr) {
        groupName = "Yesterday";
      } else {
        const d = new Date(event.rawDate);
        groupName = d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
      }

      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(event);
    });

    return groups;
  };

  const handleGraphClick = (bucket) => {
    if (bucket) {
      setSelectedDayFilter(bucket);
      timelineRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSaveRate = () => {
    const newRate = parseFloat(customRateInput);
    if (!isNaN(newRate) && newRate > 0) {
      setTariff(prev => ({
        ...prev,
        rate: newRate,
        isCustom: true
      }));
      localStorage.setItem(`tariff_rate_${deviceId}`, newRate.toString());
      setIsEditingRate(false);
    }
  };

  const handleCancelRateEdit = () => {
    setIsEditingRate(false);
  };

  const aggregatedChartData = getAggregatedData();
  const filteredEvents = getFilteredTimelineEvents();
  const groupedEvents = groupEventsByDate(filteredEvents);

  // Calculate totals dynamically for the active timeframe
  const { hours: timeframeHoursVal, kWh: timeframeKWh, cost: timeframeCost } = getTimeframeTotals();
  const formattedActiveTime = formatMetricValue(timeframeHoursVal, 'hours');

  return (
    <div className="space-y-6 pb-12">

      {/* 1. Custom Stacked Usage/Energy Chart */}
      <div className="glass-card p-5">

        {/* Row 1: Header Titles and Controls */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-900 pb-5 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Usage & Energy Analysis</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Track active cooling types and power consumption over time</p>
            </div>
          </div>

          {/* Chart Controls */}
          <div className="flex flex-wrap gap-3 w-full lg:w-auto">
            {/* Timeframe selector */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-0.5 flex">
              {[
                { id: '24h', label: '24 Hours' },
                { id: '7d', label: '7 Days' },
                { id: '12m', label: '12 Months' },
                { id: 'custom', label: 'Custom' }
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => {
                    setTimeframe(opt.id);
                    setSelectedDayFilter(null); // Clear day filter on timeframe change
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wide transition-all ${timeframe === opt.id ? 'bg-blue-600 text-slate-100 shadow-md shadow-blue-600/10' : 'text-slate-500 hover:text-slate-350'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Unit Selector */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-0.5 flex">
              {[
                { id: 'hours', label: 'Hours Active' },
                { id: 'kWh', label: 'Energy (kWh)' },
                { id: 'cost', label: 'Cost (₹)' }
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setMetric(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wide transition-all ${metric === opt.id ? 'bg-blue-600 text-slate-100 shadow-md shadow-blue-600/10' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Custom Date Picker Section */}
        {timeframe === 'custom' && (
          <div className="flex items-center gap-3 bg-slate-950/20 border border-slate-900 rounded-2xl p-3 mb-6 w-full lg:max-w-md shadow-inner">
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest pl-1">Start Date</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                max={customEndDate}
                className="bg-slate-900/60 border border-slate-800 text-slate-200 text-xs rounded-xl px-3.5 py-2 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
              />
            </div>
            <div className="text-slate-600 text-xs font-bold self-end mb-2.5">to</div>
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest pl-1">End Date</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                min={customStartDate}
                max={todayStr}
                className="bg-slate-900/60 border border-slate-800 text-slate-200 text-xs rounded-xl px-3.5 py-2 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* Row 2: Sleek Stats Cards for Timeframe Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-950/40 border border-slate-900 rounded-2xl p-4 flex items-center gap-3.5 shadow-inner">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Power className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none">Total Active Time</p>
              <p className="text-base font-extrabold text-slate-200 mt-1.5 leading-none">{formattedActiveTime}</p>
            </div>
          </div>

          <div className="bg-slate-950/40 border border-slate-900 rounded-2xl p-4 flex items-center gap-3.5 shadow-inner">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none">Est. Energy Consumed</p>
              <p className="text-base font-extrabold text-slate-200 mt-1.5 leading-none">{timeframeKWh} kWh</p>
            </div>
          </div>

          <div className="bg-slate-950/40 border border-slate-900 rounded-2xl p-4 flex items-center gap-3.5 shadow-inner">
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 w-11 h-11 flex items-center justify-center font-sans font-extrabold text-base">
              ₹
            </div>
            <div className="flex-1">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none">Total Electricity Cost</p>
              <p className="text-base font-extrabold text-slate-200 mt-1.5 leading-none">₹{timeframeCost}</p>
              {isEditingRate ? (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="text-[10px] text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={customRateInput}
                    onChange={(e) => setCustomRateInput(e.target.value)}
                    className="bg-slate-900/90 border border-slate-800 text-slate-200 text-[10px] rounded px-1.5 py-0.5 w-14 focus:outline-none focus:border-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveRate}
                    className="text-[8px] font-extrabold uppercase tracking-wide bg-blue-600 hover:bg-blue-500 text-slate-100 px-1.5 py-0.5 rounded transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancelRateEdit}
                    className="text-[8px] font-extrabold uppercase tracking-wide bg-slate-800 hover:bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded transition-colors"
                  >
                    X
                  </button>
                </div>
              ) : (
                <p className="text-[8px] text-slate-400 mt-1 leading-tight flex items-center flex-wrap gap-x-1">
                  <span>Rate: ₹{tariff.rate.toFixed(2)}/kWh in {tariff.city && tariff.city !== 'Region' ? `${tariff.city}, ` : ''}{tariff.state}{tariff.isCustom ? ' (Custom)' : ''}</span>
                  <button
                    onClick={() => {
                      setCustomRateInput(tariff.rate.toString());
                      setIsEditingRate(true);
                    }}
                    className="text-blue-400 hover:text-blue-300 underline cursor-pointer text-[8px] font-bold ml-1"
                  >
                    Edit
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Chart Rendering Area */}
        <div className="h-64 w-full pr-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={aggregatedChartData}
              onClick={(state) => {
                if (state && state.activePayload && state.activePayload.length) {
                  handleGraphClick(state.activePayload[0].payload);
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="#64748b"
                fontSize={9}
                tickLine={false}
                axisLine={false}
                dy={6}
              />
              <YAxis
                stroke="#64748b"
                fontSize={9}
                tickLine={false}
                axisLine={false}
                dx={-4}
                label={{
                  value: metric === 'hours' ? 'Active Time' : metric === 'cost' ? 'Electricity Cost (₹)' : 'Energy Consumed (kWh)',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fill: '#64748b', fontSize: 9, fontWeight: 600, textAnchor: 'middle' },
                  offset: 0,
                  dy: 10
                }}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.03)' }} />
              <Legend
                iconType="circle"
                iconSize={6}
                wrapperStyle={{ fontSize: 9, paddingTop: 16 }}
                formatter={(value) => {
                  if (value === 'eco') return <span className="text-slate-400 font-semibold ml-1">Eco Mode</span>;
                  if (value === 'normal') return <span className="text-slate-400 font-semibold ml-1">Normal Mode</span>;
                  if (value === 'powerful') return <span className="text-slate-400 font-semibold ml-1">Powerful Mode</span>;
                  return value;
                }}
              />
              <Bar dataKey="eco" name="eco" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
              <Bar dataKey="normal" name="normal" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
              <Bar dataKey="powerful" name="powerful" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. Interactive Dot-and-Line Event Timeline */}
      <div ref={timelineRef} className="glass-card p-5 space-y-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-900 pb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/25 text-purple-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Device Event Timeline</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Logs of manual changes, automations, and hardware alerts</p>
            </div>
          </div>

          {/* Quick Filters Pill Buttons */}
          <div className="flex flex-wrap gap-2 w-full lg:w-auto">
            {[
              { id: 'all', label: 'All Logs' },
              { id: 'controls', label: 'Controls & Auto' },
              { id: 'savings', label: 'Energy Savings' },
              { id: 'alerts', label: 'Alerts' }
            ].map(filter => (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id)}
                className={`px-3 py-1 rounded-full text-[9px] font-bold tracking-wide border transition-all ${activeFilter === filter.id
                    ? 'bg-purple-600 border-purple-500 text-slate-100 shadow-md shadow-purple-600/10'
                    : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-350'
                  }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Active Graph Filter Reset Indicator */}
        {selectedDayFilter && (
          <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl px-4 py-2.5 text-[11px] transition-all">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0" />
              <span>
                Filtering timeline for <strong>{selectedDayFilter.label}</strong>
              </span>
            </div>
            <button
              onClick={() => setSelectedDayFilter(null)}
              className="text-[9px] font-bold uppercase tracking-wider text-blue-400 hover:text-blue-300 bg-blue-500/20 px-2 py-1 rounded-md transition-colors"
            >
              Show All Days
            </button>
          </div>
        )}

        {/* Timeline Log List */}
        <div className="space-y-6 max-h-[420px] overflow-y-auto pr-1">
          {Object.keys(groupedEvents).length === 0 ? (
            <div className="text-center text-slate-500 py-8 text-xs font-medium">
              No events found matching the selected filters.
            </div>
          ) : (
            Object.keys(groupedEvents).map(dateGroup => (
              <div key={dateGroup} className="space-y-4">
                {/* Date Header */}
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1 border-b border-slate-900 pb-1.5">
                  {dateGroup}
                </h4>

                <div className="relative pl-4 border-l border-slate-800 ml-2.5 space-y-5">
                  {groupedEvents[dateGroup].map(event => (
                    <div key={event.id} className="relative group">
                      {/* Left Dot */}
                      <span
                        className={`absolute -left-[21px] top-1.5 w-2 h-2 rounded-full border border-slate-950 ring-4 ring-slate-950 z-10 ${event.category === 'alerts'
                            ? 'bg-rose-500 shadow-md shadow-rose-500/50'
                            : event.category === 'savings'
                              ? 'bg-emerald-500 shadow-md shadow-emerald-500/50'
                              : event.category === 'automations'
                                ? 'bg-purple-500 shadow-md shadow-purple-500/50'
                                : 'bg-blue-500 shadow-md shadow-blue-500/50'
                          }`}
                      />

                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-[11px] font-bold text-slate-500">{event.time}</span>
                          <span className="text-[11px] font-bold text-slate-200">{event.title}</span>
                        </div>

                        {/* Badge */}
                        <span
                          className={`text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border self-start sm:self-auto ${event.category === 'alerts'
                              ? 'bg-rose-500/10 border-rose-500/20 text-rose-450'
                              : event.category === 'savings'
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-450'
                                : event.category === 'automations'
                                  ? 'bg-purple-500/10 border-purple-500/20 text-purple-450'
                                  : 'bg-blue-500/10 border-blue-500/20 text-blue-450'
                            }`}
                        >
                          {event.badge}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-400 mt-1 pl-0.5 italic leading-relaxed">
                        "{event.desc}"
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>


      {/* 4. Target Temperature Line Chart */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-4 px-2">
          <Activity className="w-4 h-4 text-blue-400" />
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Detailed Temperature History</h3>
        </div>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="time" stroke="#64748b" fontSize={9} tickLine={false} axisLine={false} />
              <YAxis domain={['dataMin - 2', 'dataMax + 2']} stroke="#64748b" fontSize={9} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', fontSize: '11px' }}
                itemStyle={{ color: '#60a5fa' }}
              />
              <Line type="stepAfter" dataKey="temperature" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
