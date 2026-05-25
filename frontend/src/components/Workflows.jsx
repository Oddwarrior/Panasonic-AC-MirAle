import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Clock, Plus, Minus, Trash2, Play, Calendar, Edit2, Check, X,
  ChevronRight, ChevronDown, Leaf, ShieldAlert, Sparkles, Wind,
  RefreshCw, AlertCircle, Info, Globe, Snowflake, Sun, Droplets, Copy
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const modeOptions = [
  { id: 'cool', name: 'Cool', icon: Snowflake },
  { id: 'dry', name: 'Dry', icon: Droplets },
  { id: 'auto', name: 'Auto', icon: RefreshCw },
  { id: 'fan', name: 'Fan', icon: Wind },
  { id: 'heat', name: 'Heat', icon: Sun }
];

const fanSpeedOptions = [
  { id: 'auto', name: 'Auto' },
  { id: 'quiet', name: 'Quiet' },
  { id: 'low', name: 'Low' },
  { id: 'medium', name: 'Medium' },
  { id: 'high', name: 'High' }
];

const presetOptions = [
  { id: 'none', name: 'None', icon: X },
  { id: 'eco', name: 'Eco Mode', icon: Leaf },
  { id: 'boost', name: 'Powerful', icon: ShieldAlert },
  { id: 'clean', name: 'Nanoe-G', icon: Sparkles }
];

const convertiOptions = [
  { id: 0, name: 'Normal' },
  { id: 40, name: '40% Capacity' },
  { id: 50, name: '50% Capacity' },
  { id: 70, name: '70% Capacity' },
  { id: 80, name: '80% Capacity' },
  { id: 90, name: '90% Capacity' },
  { id: 100, name: '100% Capacity' },
  { id: 110, name: '110% Capacity' }
];

const swingOptions = [
  { id: 0, label: 'Auto' },
  { id: 1, label: '1' },
  { id: 2, label: '2' },
  { id: 3, label: '3' },
  { id: 4, label: '4' },
  { id: 5, label: '5' }
];

const daysOfWeek = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 }
];

const formatTimeTo12h = (timeStr) => {
  if (!timeStr) return '';
  const [hourStr, minStr] = timeStr.split(':');
  let hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  hour = hour ? hour : 12;
  return `${hour}:${minStr} ${ampm}`;
};

const renderStepBadges = (actions) => {
  const badges = [];

  if (actions.power !== undefined && actions.power !== null) {
    const isOn = actions.power === 'on';
    badges.push(
      <span key="power" className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase ${isOn ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400 border border-slate-700/50'}`}>
        {isOn ? 'Power On' : 'Power Off'}
      </span>
    );
  }

  if (actions.mode !== undefined && actions.mode !== null) {
    const mode = actions.mode;
    const modeColors = {
      cool: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
      dry: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
      fan: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
      auto: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
      heat: 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
    };
    badges.push(
      <span key="mode" className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase ${modeColors[mode] || 'bg-slate-800 text-slate-400'}`}>
        {mode}
      </span>
    );
  }

  if (actions.temperature !== undefined && actions.temperature !== null) {
    badges.push(
      <span key="temp" className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-blue-500/10 text-sky-400 border border-blue-500/20">
        {actions.temperature}°C
      </span>
    );
  }

  if (actions.fanMode !== undefined && actions.fanMode !== null) {
    badges.push(
      <span key="fan" className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-slate-800 text-slate-300 border border-slate-700/50 uppercase">
        Fan: {actions.fanMode}
      </span>
    );
  }

  if (actions.preset !== undefined && actions.preset !== null && actions.preset !== 'none') {
    badges.push(
      <span key="preset" className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-teal-500/10 text-teal-400 border border-teal-500/20 uppercase">
        {actions.preset === 'boost' ? 'Powerful' : actions.preset === 'clean' ? 'Nanoe-G' : 'Eco'}
      </span>
    );
  }

  if (actions.converti !== undefined && actions.converti !== null && actions.converti > 0) {
    badges.push(
      <span key="converti" className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 uppercase">
        Conv: {actions.converti}%
      </span>
    );
  }

  if (actions.vSwing !== undefined && actions.vSwing !== null) {
    badges.push(
      <span key="vswing" className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-slate-800/80 text-slate-400 border border-slate-800/50">
        V-Swing: {actions.vSwing === 0 ? 'Auto' : actions.vSwing}
      </span>
    );
  }

  if (actions.hSwing !== undefined && actions.hSwing !== null) {
    badges.push(
      <span key="hswing" className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide bg-slate-800/80 text-slate-400 border border-slate-800/50">
        H-Swing: {actions.hSwing === 0 ? 'Auto' : actions.hSwing}
      </span>
    );
  }

  if (badges.length === 0) {
    return (
      <span className="text-[10px] text-slate-500 italic">No settings modified</span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {badges}
    </div>
  );
};

export default function Workflows({ selectedDevice, token }) {
  const deviceId = selectedDevice?.id;
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState(null);

  // Model capabilities check
  const hasDetails = !!selectedDevice?.details;
  const modelStr = ((selectedDevice?.details?.modelName || '') + ' ' + (selectedDevice?.details?.modelNumber || '')).toUpperCase();
  const supportsHeat = !hasDetails || modelStr.includes('HU') || modelStr.includes('HZ') || modelStr.includes('WZ') || modelStr.includes('MZ') || modelStr.includes('HOT');
  const supportsHSwing = !hasDetails || modelStr.includes('XU') || modelStr.includes('HU') || modelStr.includes('HZ') || modelStr.includes('WZ') || modelStr.includes('MZ');

  const activeModeOptions = supportsHeat ? modeOptions : modeOptions.filter(m => m.id !== 'heat');

  // Form states
  const [formName, setFormName] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formDays, setFormDays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [formTimezone, setFormTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata');
  const [formSteps, setFormSteps] = useState([
    {
      time: '22:00',
      actions: {
        power: 'on',
        mode: 'cool',
        temperature: 24,
        fanMode: 'auto',
        vSwing: 0,
        hSwing: 0,
        preset: 'none',
        converti: 0
      },
      // Active selectors to determine what settings to apply in this step
      enabledActions: {
        power: true,
        mode: true,
        temperature: true,
        fanMode: true,
        vSwing: false,
        hSwing: false,
        preset: false,
        converti: false
      }
    }
  ]);

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/workflows?deviceId=${deviceId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error('Failed to load workflows.');
      }
      const data = await response.json();
      setWorkflows(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [deviceId, token]);

  useEffect(() => {
    if (deviceId) {
      fetchWorkflows();
    }
  }, [deviceId, fetchWorkflows]);

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const handleToggleActive = async (workflow) => {
    // Optimistic Update
    setWorkflows(prev => prev.map(w => w._id === workflow._id ? { ...w, isActive: !w.isActive } : w));

    try {
      const response = await fetch(`${API_BASE}/api/workflows/${workflow._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isActive: !workflow.isActive })
      });

      if (!response.ok) {
        throw new Error('Failed to update status');
      }
      showSuccess(`Workflow "${workflow.name}" ${!workflow.isActive ? 'activated' : 'deactivated'}`);
    } catch (err) {
      setError(err.message);
      // Revert
      setWorkflows(prev => prev.map(w => w._id === workflow._id ? { ...w, isActive: workflow.isActive } : w));
    }
  };

  const handleDeleteWorkflow = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete the workflow "${name}"?`)) return;

    try {
      const response = await fetch(`${API_BASE}/api/workflows/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete workflow.');
      }
      setWorkflows(prev => prev.filter(w => w._id !== id));
      showSuccess(`Deleted workflow "${name}"`);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleTestStep = async (workflowId, stepIndex, stepTime) => {
    try {
      const response = await fetch(`${API_BASE}/api/workflows/${workflowId}/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ stepIndex })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to trigger step');
      }

      showSuccess(`Successfully executed step at ${formatTimeTo12h(stepTime)} manually!`);
    } catch (err) {
      alert(`Error triggering step: ${err.message}`);
    }
  };

  const openCreateModal = () => {
    setEditingWorkflow(null);
    setFormName('');
    setFormIsActive(true);
    setFormDays([0, 1, 2, 3, 4, 5, 6]);
    setFormTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata');
    setFormSteps([
      {
        time: '22:00',
        isActive: true,
        actions: {
          power: 'on',
          mode: 'cool',
          temperature: 24,
          fanMode: 'auto',
          vSwing: 0,
          hSwing: 0,
          preset: 'none',
          converti: 0
        },
        enabledActions: {
          power: true,
          mode: true,
          temperature: true,
          fanMode: true,
          vSwing: false,
          hSwing: false,
          preset: false,
          converti: false
        }
      }
    ]);
    setIsModalOpen(true);
  };

  const openEditModal = (workflow) => {
    setEditingWorkflow(workflow);
    setFormName(workflow.name);
    setFormIsActive(workflow.isActive);
    setFormDays(workflow.days || [0, 1, 2, 3, 4, 5, 6]);
    setFormTimezone(workflow.timezone || 'Asia/Kolkata');

    // Map backend steps to frontend steps with checkbox states
    const mappedSteps = workflow.steps.map(s => {
      const enabled = {};
      const actions = { ...s.actions };

      // Determine which fields were configured in the database
      enabled.power = s.actions.power !== undefined && s.actions.power !== null;
      enabled.mode = s.actions.mode !== undefined && s.actions.mode !== null;
      enabled.temperature = s.actions.temperature !== undefined && s.actions.temperature !== null;
      enabled.fanMode = s.actions.fanMode !== undefined && s.actions.fanMode !== null;
      enabled.vSwing = s.actions.vSwing !== undefined && s.actions.vSwing !== null;
      enabled.hSwing = s.actions.hSwing !== undefined && s.actions.hSwing !== null;
      enabled.preset = s.actions.preset !== undefined && s.actions.preset !== null;
      enabled.converti = s.actions.converti !== undefined && s.actions.converti !== null;

      // Supply defaults for unselected fields in form builder
      if (!enabled.power) actions.power = 'on';
      if (!enabled.mode) actions.mode = 'cool';
      if (!enabled.temperature) actions.temperature = 24;
      if (!enabled.fanMode) actions.fanMode = 'auto';
      if (!enabled.vSwing) actions.vSwing = 0;
      if (!enabled.hSwing) actions.hSwing = 0;
      if (!enabled.preset) actions.preset = 'none';
      if (!enabled.converti) actions.converti = 0;

      return {
        time: s.time,
        isActive: s.isActive !== false,
        actions,
        enabledActions: enabled
      };
    });

    setFormSteps(mappedSteps);
    setIsModalOpen(true);
  };

  const handleAddStepToForm = () => {
    setFormSteps(prev => {
      let nextTime = '22:00';
      if (prev.length > 0) {
        const lastTime = prev[prev.length - 1].time;
        const [hours, minutes] = lastTime.split(':').map(Number);
        const nextHour = (hours + 1) % 24;
        nextTime = `${String(nextHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      }
      return [
        ...prev,
        {
          time: nextTime,
          isActive: true,
          actions: {
            power: 'on',
            mode: 'cool',
            temperature: 25,
            fanMode: 'auto',
            vSwing: 0,
            hSwing: 0,
            preset: 'none',
            converti: 0
          },
          enabledActions: {
            power: true,
            mode: true,
            temperature: true,
            fanMode: true,
            vSwing: false,
            hSwing: false,
            preset: false,
            converti: false
          }
        }
      ];
    });
  };

  const handleRemoveStepFromForm = (index) => {
    if (formSteps.length <= 1) {
      alert("A workflow must have at least one step.");
      return;
    }
    setFormSteps(prev => prev.filter((_, i) => i !== index));
  };

  const handleDuplicateStep = (index) => {
    setFormSteps(prev => {
      const stepToDuplicate = prev[index];
      const [hours, minutes] = stepToDuplicate.time.split(':').map(Number);
      const nextHour = (hours + 1) % 24;
      const nextTime = `${String(nextHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

      const duplicatedStep = {
        time: nextTime,
        isActive: stepToDuplicate.isActive !== false,
        actions: { ...stepToDuplicate.actions },
        enabledActions: { ...stepToDuplicate.enabledActions }
      };

      const newSteps = [...prev];
      newSteps.splice(index + 1, 0, duplicatedStep);
      return newSteps;
    });
  };

  const handleStepChange = (index, field, value) => {
    setFormSteps(prev => prev.map((step, i) => {
      if (i !== index) return step;
      return {
        ...step,
        [field]: value
      };
    }));
  };

  const handleActionValueChange = (stepIndex, actionKey, val) => {
    setFormSteps(prev => prev.map((step, i) => {
      if (i !== stepIndex) return step;
      const newActions = {
        ...step.actions,
        [actionKey]: val
      };

      const newEnabled = { ...step.enabledActions };

      // Compatibility Rules on action value change
      if (actionKey === 'mode') {
        // 1. Dry or Fan modes do not support temperature setting
        if (val === 'fan' || val === 'dry') {
          newEnabled.temperature = false;
        }
        // 2. Convertible capacity is only supported in Cool mode
        if (val !== 'cool') {
          newEnabled.converti = false;
        }
        // 3. Eco and Boost presets only work in Cool or Heat modes
        if (val === 'dry' || val === 'fan' || val === 'auto') {
          if (newActions.preset === 'eco' || newActions.preset === 'boost') {
            newActions.preset = 'none';
          }
        }
      }

      return {
        ...step,
        actions: newActions,
        enabledActions: newEnabled
      };
    }));
  };

  const handleToggleActionEnabled = (stepIndex, actionKey) => {
    setFormSteps(prev => prev.map((step, i) => {
      if (i !== stepIndex) return step;

      const newEnabled = {
        ...step.enabledActions,
        [actionKey]: !step.enabledActions[actionKey]
      };

      const willBeEnabled = newEnabled[actionKey];

      if (willBeEnabled) {
        // Enforce compatibility rules when enabling settings

        // 1. Preset vs Convertible (mutually exclusive)
        if (actionKey === 'preset') {
          newEnabled.converti = false;
        }
        if (actionKey === 'converti') {
          newEnabled.preset = false;
          // Check if mode is set to a non-cool mode
          if (newEnabled.mode && step.actions.mode !== 'cool') {
            alert("Convertible Capacity Stage is only supported in COOL mode.");
            newEnabled.converti = false;
          }
        }

        // 2. Mode vs Temperature / Convertible
        if (actionKey === 'temperature') {
          if (newEnabled.mode && (step.actions.mode === 'fan' || step.actions.mode === 'dry')) {
            alert(`Temperature control is not supported when Operation Mode is set to ${step.actions.mode.toUpperCase()}.`);
            newEnabled.temperature = false;
          }
        }

        // 3. If turning Mode ON, check if it contradicts currently enabled Temp / Convertible
        if (actionKey === 'mode') {
          if (step.actions.mode === 'fan' || step.actions.mode === 'dry') {
            newEnabled.temperature = false;
          }
          if (step.actions.mode !== 'cool') {
            newEnabled.converti = false;
          }
        }
      }

      return {
        ...step,
        enabledActions: newEnabled
      };
    }));
  };

  const handleToggleDay = (dayVal) => {
    setFormDays(prev => {
      if (prev.includes(dayVal)) {
        return prev.filter(d => d !== dayVal);
      } else {
        return [...prev, dayVal].sort();
      }
    });
  };

  const applyDaysPreset = (preset) => {
    if (preset === 'all') {
      setFormDays([0, 1, 2, 3, 4, 5, 6]);
    } else if (preset === 'weekdays') {
      setFormDays([1, 2, 3, 4, 5]);
    } else if (preset === 'weekends') {
      setFormDays([0, 6]);
    }
  };

  const handleSaveWorkflow = async (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      alert('Please enter a name for the workflow');
      return;
    }

    if (formDays.length === 0) {
      alert('Please select at least one repeating day');
      return;
    }

    // Sort steps chronologically
    const sortedSteps = [...formSteps].sort((a, b) => a.time.localeCompare(b.time));

    // Construct backend step objects containing only enabled actions
    const stepsPayload = sortedSteps.map(s => {
      const actionsObj = {};
      Object.keys(s.enabledActions).forEach(key => {
        if (s.enabledActions[key]) {
          actionsObj[key] = s.actions[key];
        }
      });

      return {
        time: s.time,
        isActive: s.isActive !== false,
        actions: actionsObj
      };
    });

    const payload = {
      deviceId,
      name: formName,
      isActive: formIsActive,
      days: formDays,
      timezone: formTimezone,
      steps: stepsPayload
    };

    try {
      let response;
      if (editingWorkflow) {
        response = await fetch(`${API_BASE}/api/workflows/${editingWorkflow._id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
      } else {
        response = await fetch(`${API_BASE}/api/workflows`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
      }

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to save workflow');
      }

      showSuccess(editingWorkflow ? `Workflow "${formName}" updated!` : `Workflow "${formName}" created!`);
      setIsModalOpen(false);
      fetchWorkflows();
    } catch (err) {
      alert(err.message);
    }
  };

  const getDayNames = (daysArray) => {
    if (daysArray.length === 7) return 'Every day';
    if (daysArray.length === 5 && !daysArray.includes(0) && !daysArray.includes(6)) return 'Weekdays';
    if (daysArray.length === 2 && daysArray.includes(0) && daysArray.includes(6)) return 'Weekends';
    return daysArray.map(d => daysOfWeek.find(day => day.value === d)?.label).join(', ');
  };

  const formatStepActions = (actions) => {
    const list = [];
    if (actions.power !== undefined && actions.power !== null) list.push(actions.power === 'on' ? 'Power On' : 'Power Off');
    if (actions.mode !== undefined && actions.mode !== null) list.push(`${actions.mode.toUpperCase()}`);
    if (actions.temperature !== undefined && actions.temperature !== null) list.push(`${actions.temperature}°C`);
    if (actions.fanMode !== undefined && actions.fanMode !== null) list.push(`Fan: ${actions.fanMode.toUpperCase()}`);
    if (actions.preset !== undefined && actions.preset !== null && actions.preset !== 'none') list.push(`Preset: ${actions.preset.toUpperCase()}`);
    if (actions.vSwing !== undefined && actions.vSwing !== null) list.push(`V-Swing: ${actions.vSwing === 0 ? 'Auto' : actions.vSwing}`);
    if (actions.hSwing !== undefined && actions.hSwing !== null) list.push(`H-Swing: ${actions.hSwing === 0 ? 'Auto' : actions.hSwing}`);
    if (actions.converti !== undefined && actions.converti !== null) list.push(`Converti: ${actions.converti === 0 ? 'Normal' : actions.converti + '%'}`);

    if (list.length === 0) return 'No settings updated';
    return list.join(' • ');
  };

  return (
    <div className="space-y-6">

      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-50 tracking-tight flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-400" />
            <span>Schedules & Workflows</span>
          </h2>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Build custom automated sequences to regulate your AC throughout the day.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-slate-50 border border-blue-500 font-semibold rounded-xl text-xs transition-all active:scale-95 shadow-md shadow-blue-600/10"
        >
          <Plus className="w-4 h-4" />
          <span>Create Workflow</span>
        </button>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold animate-pulse">
          <Check className="w-4 h-4" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main workflows list */}
      {loading ? (
        <div className="glass-panel p-12 flex flex-col items-center justify-center text-slate-400 gap-3">
          <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
          <span className="text-xs font-medium tracking-wide">Retrieving workflows...</span>
        </div>
      ) : workflows.length === 0 ? (
        <div className="glass-panel p-12 text-center space-y-4">
          <div className="inline-flex p-4 rounded-full bg-slate-800/40 border border-slate-700/30 text-slate-500">
            <Clock className="w-8 h-8" />
          </div>
          <div className="max-w-sm mx-auto space-y-1.5">
            <h3 className="font-bold text-slate-200 text-sm">No Workflows Configured</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Define daily automations like Sleep sequences, Office mode pre-cooling, or Energy conservation presets.
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold transition-colors"
          >
            Create Your First Workflow
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {workflows.map((wf) => (
            <div key={wf._id} className={`glass-panel p-5 relative flex flex-col justify-between overflow-hidden transition-all duration-300 border ${wf.isActive ? 'border-blue-500/10 shadow-lg shadow-blue-500/5' : 'border-slate-800/40 opacity-70'}`}>

              {/* Header inside card */}
              <div className="flex justify-between items-start gap-4 mb-4">
                <div className="space-y-0.5">
                  <h3 className="font-bold text-slate-50 text-base tracking-tight">{wf.name}</h3>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span>{getDayNames(wf.days)}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium pt-1">
                    <Globe className="w-3 h-3" />
                    <span>Timezone: {wf.timezone}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 z-10">
                  {/* Active Toggle Switch */}
                  <button
                    onClick={() => handleToggleActive(wf)}
                    className="p-1 text-slate-400 hover:text-slate-200 transition-colors focus:outline-none"
                    title={wf.isActive ? 'Deactivate schedule' : 'Activate schedule'}
                  >
                    <div className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-300 ease-in-out border flex items-center ${wf.isActive ? 'bg-blue-600 border-blue-500/20' : 'bg-slate-950 border-slate-800'}`}>
                      <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-300 ease-in-out ${wf.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => openEditModal(wf)}
                    className="p-1.5 rounded-lg bg-slate-800/40 border border-slate-700/50 text-slate-400 hover:text-slate-100 transition-colors"
                    title="Edit workflow"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDeleteWorkflow(wf._id, wf.name)}
                    className="p-1.5 rounded-lg bg-rose-950/20 border border-rose-900/30 text-rose-400 hover:text-rose-300 hover:bg-rose-900/50 transition-colors"
                    title="Delete workflow"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Steps timeline in card */}
              <div className="space-y-3.5 border-t border-slate-800/50 pt-4 flex-1">
                {wf.steps.map((step, idx) => {
                  const isStepActive = step.isActive !== false;
                  return (
                    <div key={idx} className={`flex gap-3 items-start relative group transition-all duration-300 ${!isStepActive ? 'opacity-45' : ''}`}>
                      {/* Visual vertical timeline line */}
                      {idx !== wf.steps.length - 1 && (
                        <div className={`absolute left-4 top-8 bottom-0 w-0.5 border-l-2 border-dashed ${wf.isActive && isStepActive ? 'border-blue-500/30' : 'border-slate-800/60'}`} style={{ transform: 'translateX(-50%)' }} />
                      )}

                      {/* Timeline dot */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border shrink-0 transition-all duration-300 ${!isStepActive
                          ? 'bg-slate-950 text-slate-600 border-slate-900/80'
                          : wf.isActive
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 shadow-sm shadow-blue-500/5'
                            : 'bg-slate-800/50 text-slate-500 border-slate-700/50'
                        }`}>
                        {idx + 1}
                      </div>

                      {/* Step details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className={`font-semibold text-xs ${!isStepActive ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                              {formatTimeTo12h(step.time)}
                            </span>
                            {!isStepActive && (
                              <span className="text-[8px] font-extrabold uppercase px-1 py-0.2 bg-slate-950 text-slate-500 border border-slate-800 rounded">Disabled</span>
                            )}
                            {isStepActive && <ChevronRight className="w-3 h-3 text-slate-600" />}
                          </div>

                          {/* Test Step trigger button */}
                          <button
                            onClick={() => handleTestStep(wf._id, idx, step.time)}
                            className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus:opacity-100 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-semibold text-slate-300 transition-all active:scale-95"
                            title="Run actions for this step immediately"
                          >
                            <Play className="w-2.5 h-2.5 fill-current text-slate-400" />
                            <span>Run Now</span>
                          </button>
                        </div>
                        {renderStepBadges(step.actions)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE / EDIT DIALOG MODAL */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800/50 rounded-2xl sm:rounded-3xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl p-4 sm:p-6 relative flex flex-col focus:outline-none">

            {/* Modal header */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-800/50 mb-4 sm:mb-5">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-50 pr-6">
                  {editingWorkflow ? 'Modify Automation Workflow' : 'Create Automation Workflow'}
                </h3>
                <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium pr-6">
                  {editingWorkflow ? 'Edit step settings and repetition days' : 'Configure timezone-safe schedule rules'}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveWorkflow} className="space-y-4 sm:space-y-5 flex-1">

              {/* Row 1: Name and Active status */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider pl-0.5">
                    Workflow Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Summer Night Sleep, Office Hours"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 text-xs transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider pl-0.5 block">
                    Status
                  </label>
                  <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800/60 select-none">
                    <button
                      type="button"
                      onClick={() => setFormIsActive(true)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all focus:outline-none ${formIsActive ? 'bg-blue-600 text-slate-50 shadow-sm' : 'text-slate-500 hover:text-slate-350'}`}
                    >
                      Active
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormIsActive(false)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all focus:outline-none ${!formIsActive ? 'bg-slate-800 text-slate-350 shadow-sm border border-slate-700/30' : 'text-slate-500 hover:text-slate-350'}`}
                    >
                      Disabled
                    </button>
                  </div>
                </div>
              </div>

              {/* Timezone and Repeats presets row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-800/40 pt-4">
                {/* Repeats select */}
                <div className="space-y-1.5">
                  <div className="flex flex-col xs:flex-row xs:justify-between xs:items-center gap-1.5 mb-1">
                    <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider pl-0.5">
                      Repeats On
                    </label>
                    <div className="flex gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => applyDaysPreset('all')}
                        className="text-[9px] font-bold text-blue-400 hover:text-blue-300"
                      >
                        All
                      </button>
                      <span className="text-slate-700 text-[9px]">•</span>
                      <button
                        type="button"
                        onClick={() => applyDaysPreset('weekdays')}
                        className="text-[9px] font-bold text-blue-400 hover:text-blue-300"
                      >
                        Weekdays
                      </button>
                      <span className="text-slate-700 text-[9px]">•</span>
                      <button
                        type="button"
                        onClick={() => applyDaysPreset('weekends')}
                        className="text-[9px] font-bold text-blue-400 hover:text-blue-300"
                      >
                        Weekends
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between gap-1 select-none w-full">
                    {daysOfWeek.map((day) => {
                      const isSelected = formDays.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => handleToggleDay(day.value)}
                          className={`w-7 h-7 sm:w-8 sm:h-8 shrink-0 rounded-full text-[10px] sm:text-xs font-bold transition-all duration-200 border focus:outline-none flex items-center justify-center ${isSelected
                              ? 'bg-blue-600 text-slate-50 border-blue-500 shadow-md shadow-blue-600/20 active:scale-90'
                              : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-350 hover:border-slate-700'
                            }`}
                          title={day.label}
                        >
                          {day.label.charAt(0)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Timezone */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider pl-0.5 flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5 text-slate-500" />
                    <span>Target Timezone</span>
                  </label>
                  <div className="relative">
                    <select
                      value={formTimezone}
                      onChange={(e) => setFormTimezone(e.target.value)}
                      className="w-full appearance-none pl-4 pr-10 py-2.5 bg-slate-950 border border-slate-800/60 rounded-xl text-slate-200 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 text-xs transition-colors cursor-pointer"
                    >
                      <option value="Asia/Kolkata">India (GMT+5:30) - Asia/Kolkata</option>
                      <option value="UTC">Coordinated Universal Time (UTC)</option>
                      <option value="America/New_York">US Eastern (America/New_York)</option>
                      <option value="America/Los_Angeles">US Pacific (America/Los_Angeles)</option>
                      <option value="Europe/London">London (Europe/London)</option>
                      <option value="Europe/Paris">Central Europe (Europe/Paris)</option>
                      <option value="Asia/Singapore">Singapore (Asia/Singapore)</option>
                      <option value="Australia/Sydney">Sydney (Australia/Sydney)</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Dynamic steps section */}
              <div className="border-t border-slate-800/40 pt-4 space-y-4">
                <div className="flex justify-between items-center pb-1">
                  <h4 className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider pl-0.5">
                    Workflow Sequence Steps
                  </h4>
                </div>

                <div className="space-y-4">
                  {formSteps.map((step, idx) => (
                    <div key={idx} className={`p-4 bg-slate-950 border border-slate-800/50 rounded-2xl relative space-y-4 group shadow-sm shadow-slate-950/20 transition-all duration-300 ${step.isActive === false ? 'opacity-50' : ''}`}>

                      {/* Step index & Remove button */}
                      <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-slate-400">Step {idx + 1}</span>
                          {/* Step Active/Disabled switch */}
                          <button
                            type="button"
                            onClick={() => handleStepChange(idx, 'isActive', step.isActive !== false ? false : true)}
                            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-bold tracking-wide uppercase transition-all focus:outline-none active:scale-95 cursor-pointer ${step.isActive !== false
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-slate-900 text-slate-500 border-slate-800/80'
                              }`}
                          >
                            <span className={`w-1 h-1 rounded-full ${step.isActive !== false ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                            <span>{step.isActive !== false ? 'Enabled' : 'Disabled'}</span>
                          </button>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDuplicateStep(idx)}
                            className="p-1 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition-colors focus:outline-none"
                            title="Duplicate this step"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          {formSteps.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveStepFromForm(idx)}
                              className="p-1 rounded-lg hover:bg-slate-900 text-rose-500 hover:text-rose-400 transition-colors focus:outline-none"
                              title="Delete this step"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Time setter and checkboxes for which actions are enabled */}
                      <div className="grid grid-cols-1 sm:grid-cols-6 gap-4 items-start">
                        {/* Time */}
                        <div className="sm:col-span-2 space-y-1">
                          <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex justify-between items-center pr-1">
                            <span>Trigger Time</span>
                            <span className="text-blue-400 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded text-[9px] tracking-normal normal-case">{formatTimeTo12h(step.time)}</span>
                          </label>
                          <input
                            type="time"
                            required
                            value={step.time}
                            onChange={(e) => handleStepChange(idx, 'time', e.target.value)}
                            className="w-full h-9 px-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-blue-500/60"
                          />
                        </div>

                        {/* Action overrides triggers checkboxes */}
                        <div className="sm:col-span-4 space-y-1">
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                              Modify Settings:
                            </label>
                            {step.enabledActions.preset && step.enabledActions.converti && (
                              <span className="text-[8px] text-amber-500 font-bold uppercase tracking-wider">Mutually Exclusive</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {Object.keys(step.enabledActions)
                              .filter(key => supportsHSwing || key !== 'hSwing')
                              .map((actKey) => (
                                <button
                                  key={actKey}
                                  type="button"
                                  onClick={() => handleToggleActionEnabled(idx, actKey)}
                                  className={`px-2.5 py-1.5 rounded-xl border text-[10px] font-semibold transition-all flex items-center gap-1.5 focus:outline-none active:scale-95 ${step.enabledActions[actKey]
                                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 shadow-sm'
                                      : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-400 hover:border-slate-700'
                                    }`}
                                >
                                  {step.enabledActions[actKey] && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
                                  )}
                                  <span>
                                    {actKey === 'vSwing' ? 'V-Swing' : actKey === 'hSwing' ? 'H-Swing' : actKey === 'fanMode' ? 'Fan Speed' : actKey === 'converti' ? 'Converti' : actKey.charAt(0).toUpperCase() + actKey.slice(1)}
                                  </span>
                                </button>
                              ))}
                          </div>
                        </div>
                      </div>

                      {/* Configured values forms (only for enabled settings) */}
                      {Object.values(step.enabledActions).some(Boolean) ? (
                        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3 p-3 bg-slate-900/40 rounded-xl border border-slate-800/60">

                          {/* 1. Power */}
                          {step.enabledActions.power && (
                            <div className="space-y-1">
                              <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Power</label>
                              <div className="flex gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800/60 h-9 items-center select-none">
                                {['on', 'off'].map((pState) => (
                                  <button
                                    key={pState}
                                    type="button"
                                    onClick={() => handleActionValueChange(idx, 'power', pState)}
                                    className={`flex-1 h-7 flex items-center justify-center rounded-lg text-xs font-semibold transition-all focus:outline-none ${step.actions.power === pState
                                        ? pState === 'on'
                                          ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                                          : 'bg-rose-900/30 text-rose-400 border border-rose-800/30'
                                        : 'text-slate-500 hover:text-slate-350'
                                      }`}
                                  >
                                    {pState.toUpperCase()}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 2. HVAC Mode */}
                          {step.enabledActions.mode && (
                            <div className="space-y-1">
                              <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Mode</label>
                              <div className="relative">
                                <select
                                  value={step.actions.mode}
                                  onChange={(e) => handleActionValueChange(idx, 'mode', e.target.value)}
                                  className="w-full appearance-none h-9 pl-3 pr-8 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 text-xs focus:outline-none cursor-pointer"
                                >
                                  {activeModeOptions.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                  ))}
                                </select>
                                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500">
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 3. Temperature */}
                          {step.enabledActions.temperature && (
                            <div className="space-y-1">
                              <div className="flex justify-between items-center">
                                <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Temp</label>
                                {step.enabledActions.mode && (step.actions.mode === 'dry' || step.actions.mode === 'fan') && (
                                  <span className="text-[8px] text-amber-500 font-bold uppercase tracking-wide">Locked</span>
                                )}
                              </div>
                              <div className="flex items-center bg-slate-950 rounded-xl border border-slate-800/60 p-1 h-9">
                                <button
                                  type="button"
                                  disabled={step.actions.temperature <= 16 || (step.enabledActions.mode && (step.actions.mode === 'dry' || step.actions.mode === 'fan'))}
                                  onClick={() => handleActionValueChange(idx, 'temperature', Math.max(16, step.actions.temperature - 1))}
                                  className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-20 text-slate-400 flex items-center justify-center font-bold transition-colors focus:outline-none"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="flex-1 text-center text-xs font-bold text-slate-200">
                                  {step.actions.temperature}°C
                                </span>
                                <button
                                  type="button"
                                  disabled={step.actions.temperature >= 30 || (step.enabledActions.mode && (step.actions.mode === 'dry' || step.actions.mode === 'fan'))}
                                  onClick={() => handleActionValueChange(idx, 'temperature', Math.min(30, step.actions.temperature + 1))}
                                  className="w-7 h-7 rounded-lg bg-slate-900 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-20 text-slate-400 flex items-center justify-center font-bold transition-colors focus:outline-none"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* 4. Fan Speed */}
                          {step.enabledActions.fanMode && (
                            <div className="space-y-1">
                              <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Fan Speed</label>
                              <div className="relative">
                                <select
                                  value={step.actions.fanMode}
                                  onChange={(e) => handleActionValueChange(idx, 'fanMode', e.target.value)}
                                  className="w-full appearance-none h-9 pl-3 pr-8 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 text-xs focus:outline-none cursor-pointer"
                                >
                                  {fanSpeedOptions.map(f => (
                                    <option key={f.id} value={f.id}>{f.name}</option>
                                  ))}
                                </select>
                                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500">
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 5. V Swing */}
                          {step.enabledActions.vSwing && (
                            <div className="space-y-1">
                              <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Vertical Swing</label>
                              <div className="relative">
                                <select
                                  value={step.actions.vSwing}
                                  onChange={(e) => handleActionValueChange(idx, 'vSwing', parseInt(e.target.value))}
                                  className="w-full appearance-none h-9 pl-3 pr-8 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 text-xs focus:outline-none cursor-pointer"
                                >
                                  {swingOptions.map(o => (
                                    <option key={`v-${o.id}`} value={o.id}>{o.label}</option>
                                  ))}
                                </select>
                                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500">
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 6. H Swing */}
                          {step.enabledActions.hSwing && (
                            <div className="space-y-1">
                              <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Horizontal Swing</label>
                              <div className="relative">
                                <select
                                  value={step.actions.hSwing}
                                  onChange={(e) => handleActionValueChange(idx, 'hSwing', parseInt(e.target.value))}
                                  className="w-full appearance-none h-9 pl-3 pr-8 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 text-xs focus:outline-none cursor-pointer"
                                >
                                  {swingOptions.map(o => (
                                    <option key={`h-${o.id}`} value={o.id}>{o.label}</option>
                                  ))}
                                </select>
                                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500">
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 7. Preset */}
                          {step.enabledActions.preset && (
                            <div className="space-y-1">
                              <div className="flex justify-between items-center">
                                <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Preset Mode</label>
                                {step.enabledActions.mode && (step.actions.mode === 'dry' || step.actions.mode === 'fan' || step.actions.mode === 'auto') && step.actions.preset !== 'none' && step.actions.preset !== 'clean' && (
                                  <span className="text-[8px] text-amber-500 font-bold uppercase tracking-wide">Overridden</span>
                                )}
                              </div>
                              <div className="relative">
                                <select
                                  value={step.actions.preset}
                                  onChange={(e) => handleActionValueChange(idx, 'preset', e.target.value)}
                                  className="w-full appearance-none h-9 pl-3 pr-8 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 text-xs focus:outline-none cursor-pointer"
                                >
                                  {presetOptions
                                    .filter(p => {
                                      if (step.enabledActions.mode && (step.actions.mode === 'dry' || step.actions.mode === 'fan' || step.actions.mode === 'auto')) {
                                        return p.id === 'none' || p.id === 'clean';
                                      }
                                      return true;
                                    })
                                    .map(p => (
                                      <option key={p.id} value={p.id}>{p.name}</option>
                                    ))
                                  }
                                </select>
                                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500">
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 8. Converti */}
                          {step.enabledActions.converti && (
                            <div className="space-y-1">
                              <div className="flex justify-between items-center">
                                <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Converti Stage</label>
                                {step.enabledActions.mode && step.actions.mode !== 'cool' && (
                                  <span className="text-[8px] text-rose-500 font-bold uppercase tracking-wide">Cool Only</span>
                                )}
                              </div>
                              <div className="relative">
                                <select
                                  value={step.actions.converti}
                                  onChange={(e) => handleActionValueChange(idx, 'converti', parseInt(e.target.value))}
                                  className="w-full appearance-none h-9 pl-3 pr-8 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 text-xs focus:outline-none cursor-pointer"
                                >
                                  {convertiOptions.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
                                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500">
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </div>
                              </div>
                            </div>
                          )}

                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 p-3 rounded-xl bg-slate-900/30 border border-slate-800/60 text-slate-500 text-[10px] font-semibold">
                          <Info className="w-3.5 h-3.5" />
                          <span>No parameters selected. Toggle settings above to modify target values for this step.</span>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Add Step Button below the list */}
                  <button
                    type="button"
                    onClick={handleAddStepToForm}
                    className="w-full py-3 rounded-2xl border border-dashed border-slate-800 hover:border-blue-500/40 hover:bg-blue-500/5 text-slate-400 hover:text-blue-400 flex items-center justify-center gap-2 text-xs font-semibold transition-all focus:outline-none active:scale-[0.99] cursor-pointer mt-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Step</span>
                  </button>
                </div>
              </div>

              {/* Modal controls actions footer */}
              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 hover:text-slate-200 transition-colors text-xs font-semibold text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-slate-50 border border-blue-500 font-semibold text-xs transition-colors shadow-md shadow-blue-600/10"
                >
                  {editingWorkflow ? 'Update Workflow' : 'Create Workflow'}
                </button>
              </div>

            </form>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
