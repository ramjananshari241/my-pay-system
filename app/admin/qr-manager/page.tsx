'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase'

const GROUP_MAPPING: { [key: string]: string } = {
  '全部': '全部',
  '集合1': '支付宝',
  '集合2': '微信支付',
  '集合3': 'USDT (TRC20)',
}
const SORT_ORDER = ['全部', '集合1', '集合2', '集合3']

export default function QrManagerPage() {
  const [qrs, setQrs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('全部')
  const [groups, setGroups] = useState<string[]>(['全部'])
  
  // --- 新增：编辑状态 ---
  const [editingId, setEditingId] = useState<number | null>(null)
  const [newName, setNewName] = useState('')

  const fetchQrs = async () => {
    const { data } = await supabase.from('qr_codes').select('*').order('id', { ascending: false })
    if (data) {
      setQrs(data)
      const uniqueGroups = Array.from(new Set(data.map((q: any) => q.group_name)))
      setGroups(['全部', ...uniqueGroups].sort((a,b) => SORT_ORDER.indexOf(a) - SORT_ORDER.indexOf(b)))
    }
    setLoading(false)
  }

  useEffect(() => { fetchQrs() }, [])

  // --- 新增：保存新名称逻辑 ---
  const handleUpdateName = async (id: number) => {
    if (!newName.trim()) return setEditingId(null)
    const { error } = await supabase.from('qr_codes').update({ name: newName }).eq('id', id)
    if (!error) {
      setQrs(qrs.map(q => q.id === id ? { ...q, name: newName } : q))
      setEditingId(null)
    }
  }

  const toggleStatus = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'restricted' : 'active'
    await supabase.from('qr_codes').update({ status: newStatus }).eq('id', id)
    fetchQrs()
  }

  const resetCount = async (id: number) => {
    if(!confirm('确定重置？')) return
    await supabase.from('qr_codes').update({ today_usage: 0 }).eq('id', id)
    fetchQrs()
  }

  const deleteQr = async (id: number) => {
    if (!confirm('永久删除且关联订单也会消失，确定？')) return
    await supabase.from('qr_codes').delete().eq('id', id)
    fetchQrs()
  }

  const handleResetAll = async () => {
    if (!confirm('重置所有正常码计数？')) return
    await supabase.from('qr_codes').update({ today_usage: 0 }).eq('status', 'active')
    fetchQrs()
  }

  const filteredQrs = activeTab === '全部' ? qrs : qrs.filter(q => q.group_name === activeTab)

  return (
    <div className="p-10 bg-gray-50 min-h-screen text-gray-900 font-sans">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <h1 className="text-3xl font-black tracking-tight text-gray-950 uppercase italic">Vault Management</h1>
          <div className="flex gap-4">
            <button onClick={handleResetAll} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl shadow-lg shadow-indigo-200 font-bold text-sm hover:bg-indigo-700 transition-all active:scale-95 flex items-center gap-2">🔄 一键清零</button>
            <button onClick={fetchQrs} className="bg-white border border-gray-200 px-6 py-2.5 rounded-xl shadow-sm font-bold text-sm hover:bg-gray-50 transition-all text-gray-500">刷新</button>
          </div>
        </div>

        <div className="flex gap-3 mb-8 overflow-x-auto pb-4">
          {groups.map(group => (
            <button key={group} onClick={() => setActiveTab(group)} className={`px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all border ${activeTab === group ? 'bg-black text-white border-black shadow-xl shadow-black/20' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'}`}>
              {GROUP_MAPPING[group] || group}
            </button>
          ))}
        </div>
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredQrs.map(qr => (
            <div key={qr.id} className={`p-6 rounded-[2rem] border transition-all duration-500 ${qr.status === 'restricted' ? 'border-orange-400 bg-orange-50 shadow-2xl shadow-orange-100 scale-[1.03]' : 'border-gray-200 bg-white shadow-sm hover:shadow-xl'}`}>
              <div className="flex justify-between items-start mb-6">
                <div className="flex-1 mr-4">
                  {/* --- 名称修改区域 --- */}
                  {editingId === qr.id ? (
                    <div className="flex gap-2">
                      <input autoFocus className="border-b-2 border-indigo-500 outline-none font-bold text-lg w-full bg-transparent" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleUpdateName(qr.id)} />
                      <button onClick={() => handleUpdateName(qr.id)} className="text-xs bg-indigo-500 text-white p-1 px-2 rounded">保存</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group">
                      <h3 className="font-black text-xl text-gray-900 tracking-tight">{qr.name}</h3>
                      <button onClick={() => { setEditingId(qr.id); setNewName(qr.name); }} className="opacity-0 group-hover:opacity-100 text-xs text-indigo-500 font-bold transition-all">✎ 修改</button>
                    </div>
                  )}
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">{GROUP_MAPPING[qr.group_name] || qr.group_name}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${qr.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-500 text-white animate-pulse'}`}>{qr.status === 'active' ? 'Online' : 'Limited'}</span>
              </div>
              
              <div className="mb-6 flex items-center gap-6 bg-gray-50 p-4 rounded-3xl">
                <img src={qr.image_url} className="w-20 h-20 object-contain rounded-xl bg-white p-1 border shadow-sm" />
                <div className="flex-1">
                  <div className="flex justify-between text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2"><span>Capacity</span><span>{qr.today_usage}/{qr.daily_limit}</span></div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full transition-all duration-1000 ${qr.today_usage >= qr.daily_limit ? 'bg-red-500' : 'bg-indigo-600'}`} style={{ width: `${Math.min((qr.today_usage / qr.daily_limit) * 100, 100)}%` }}></div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => toggleStatus(qr.id, qr.status)} className={`py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${qr.status === 'active' ? 'border border-gray-200 text-gray-500 hover:bg-gray-950 hover:text-white hover:border-gray-950' : 'bg-emerald-500 text-white shadow-lg shadow-emerald-200'}`}>
                  {qr.status === 'active' ? 'Ban Access' : 'Restore'}
                </button>
                <div className="flex gap-2">
                  <button onClick={() => resetCount(qr.id)} className="flex-1 border border-gray-100 rounded-2xl hover:bg-orange-50 hover:text-orange-600 transition-all text-[10px] font-black uppercase">Clear</button>
                  <button onClick={() => deleteQr(qr.id)} className="flex-1 border border-red-50 rounded-2xl hover:bg-red-500 hover:text-white transition-all text-[10px] font-black uppercase text-red-300">Del</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}