'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase'

export default function StaffManager() {
  const [staffs, setStaffs] = useState<any[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchStaff = async () => {
    const { data } = await supabase.from('staff').select('*').order('id', { ascending: false })
    if (data) setStaffs(data)
  }

  useEffect(() => { fetchStaff() }, [])

  const addStaff = async () => {
    if (!name.trim()) return
    setLoading(true)
    const { error } = await supabase.from('staff').insert([{ name: name.trim() }])
    if (error) {
      alert('添加失败，可能名字重复或网络问题')
    } else {
      setName(''); fetchStaff()
    }
    setLoading(false)
  }

  const deleteStaff = async (id: number) => {
    if (confirm('确定要移除这位客服吗？移除后新工单将无法选择此人。')) {
      await supabase.from('staff').delete().eq('id', id)
      fetchStaff()
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-10 font-sans">
      <div className="max-w-xl mx-auto">
        <p className="text-[10px] text-slate-500 uppercase font-black tracking-[0.4em] mb-4 text-center">Internal Human Resources</p>
        <h1 className="text-3xl font-black mb-10 italic uppercase tracking-tighter text-center">客服员工管理</h1>
        
        {/* 输入框区域 */}
        <div className="bg-slate-900 p-6 rounded-[2rem] border border-slate-800 mb-10 shadow-2xl">
          <div className="flex gap-3">
            <input 
              className="flex-1 bg-slate-950 border border-slate-800 p-4 rounded-2xl outline-none focus:border-indigo-500 transition-all font-bold text-sm" 
              placeholder="输入客服姓名 (例如: 小何)..." 
              value={name} 
              onChange={e => setName(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && addStaff()}
            />
            <button 
              onClick={addStaff} 
              disabled={loading}
              className="bg-white text-black px-8 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-50 transition-all active:scale-95 disabled:opacity-50"
            >
              {loading ? '...' : 'ADD'}
            </button>
          </div>
        </div>

        {/* 员工列表 */}
        <div className="space-y-3">
          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4 mb-4">Active Agents / 在职客服</p>
          {staffs.length === 0 && <p className="text-center text-slate-600 py-10 font-mono text-xs uppercase">No agents found in database</p>}
          {staffs.map(s => (
            <div key={s.id} className="flex justify-between items-center p-5 bg-slate-900/50 rounded-2xl border border-slate-800 hover:border-slate-700 transition-colors group">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center font-bold text-indigo-400">
                  {s.name.charAt(0)}
                </div>
                <span className="font-bold text-lg">{s.name}</span>
              </div>
              <button 
                onClick={() => deleteStaff(s.id)} 
                className="opacity-0 group-hover:opacity-100 text-red-500 text-[10px] font-black uppercase tracking-widest hover:underline transition-all"
              >
                Terminate
              </button>
            </div>
          ))}
        </div>

        <div className="mt-20 text-center">
            <p className="text-[10px] text-slate-700 font-mono italic">Staff data is synced with the dispatch terminal dropdown.</p>
        </div>
      </div>
    </div>
  )
}