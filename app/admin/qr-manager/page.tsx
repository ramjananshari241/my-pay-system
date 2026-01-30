'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase'

// --- 配置区域：在这里修改集合显示的名称 ---
const GROUP_MAPPING: { [key: string]: string } = {
  '全部': '全部',
  '集合1': '支付宝 (集合1)',
  '集合2': '微信 (集合2)',
  '集合3': 'USDT (集合3)',
  // 如果有更多集合，继续往下加，比如 '集合4': '备用金'
}

// --- 配置区域：在这里定义标签的排列顺序 ---
const SORT_ORDER = ['全部', '集合1', '集合2', '集合3']

export default function QrManagerPage() {
  const [qrs, setQrs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  const [activeTab, setActiveTab] = useState('全部')
  const [groups, setGroups] = useState<string[]>(['全部'])

  const fetchQrs = async () => {
    const { data, error } = await supabase
      .from('qr_codes')
      .select('*')
      .order('id', { ascending: false }) 
    
    if (data) {
      setQrs(data)
      
      // 1. 提取数据库里实际存在的分组
      const uniqueGroups = Array.from(new Set(data.map((q: any) => q.group_name)))
      
      // 2. 合并 "全部" 和 实际分组
      const allFoundGroups = ['全部', ...uniqueGroups]

      // 3. 按照我们设定的 SORT_ORDER 进行排序
      // 如果数据库里有 SORT_ORDER 没定义的集合（比如集合4），它会被排到最后
      const sortedGroups = allFoundGroups.sort((a, b) => {
        const indexA = SORT_ORDER.indexOf(a)
        const indexB = SORT_ORDER.indexOf(b)
        // 如果都在配置表里，按配置表排序
        if (indexA !== -1 && indexB !== -1) return indexA - indexB
        // 如果有一个不在，不在的排后面
        if (indexA !== -1) return -1
        if (indexB !== -1) return 1
        return 0
      })

      setGroups(sortedGroups)
    }
    setLoading(false)
  }

  useEffect(() => { fetchQrs() }, [])

  // 筛选逻辑
  const filteredQrs = activeTab === '全部' 
    ? qrs 
    : qrs.filter(q => q.group_name === activeTab)

  const toggleStatus = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'restricted' : 'active'
    await supabase.from('qr_codes').update({ status: newStatus }).eq('id', id)
    fetchQrs()
  }

  const resetCount = async (id: number) => {
    if(!confirm('确定要重置今日收款次数吗？')) return
    await supabase.from('qr_codes').update({ today_usage: 0 }).eq('id', id)
    fetchQrs()
  }

  const deleteQr = async (id: number) => {
    if (!confirm('确定要永久删除这个二维码吗？')) return
    await supabase.from('qr_codes').delete().eq('id', id)
    fetchQrs()
  }

  const handleResetAll = async () => {
    if (!confirm('【高危操作】确定要重置所有【正常状态】二维码的今日计数吗？')) return
    setLoading(true)
    try {
      const { error } = await supabase.from('qr_codes').update({ today_usage: 0 }).eq('status', 'active')
      if (error) throw error
      alert('所有正常二维码的计数已重置！')
      fetchQrs()
    } catch (err: any) { alert(err.message) } finally { setLoading(false) }
  }

  // 辅助函数：获取显示名称
  const getDisplayName = (groupName: string) => {
    return GROUP_MAPPING[groupName] || groupName // 如果没有配置映射，就显示原名
  }

  return (
    <div className="p-10 bg-gray-100 min-h-screen text-gray-900">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <h1 className="text-2xl font-bold">二维码管理中心</h1>
          <div className="flex gap-3">
            <button onClick={handleResetAll} className="bg-indigo-600 text-white px-4 py-2 rounded shadow hover:bg-indigo-700 font-bold text-sm flex items-center gap-1"><span>🔄</span> 一键重置今日次数</button>
            <button onClick={fetchQrs} className="bg-white border border-gray-300 px-4 py-2 rounded hover:bg-gray-50 text-sm font-medium">刷新列表</button>
          </div>
        </div>

        {/* --- 分类标签栏 (已应用排序和重命名) --- */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {groups.map(group => (
            <button
              key={group}
              onClick={() => setActiveTab(group)}
              className={`px-5 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap shadow-sm border ${
                activeTab === group 
                  ? 'bg-black text-white border-black' 
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {/* 这里调用映射函数显示别名 */}
              {getDisplayName(group)}
            </button>
          ))}
        </div>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredQrs.map(qr => (
            <div 
              key={qr.id} 
              className={`p-4 rounded-xl shadow-sm border relative transition-all duration-300 
                ${qr.status === 'restricted' 
                  ? 'border-2 border-orange-400 bg-orange-50 shadow-orange-100 scale-[1.02]' 
                  : 'border border-gray-200 bg-white'
                }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg text-gray-800">{qr.name}</h3>
                  {/* 这里的小标签也应用映射名称 */}
                  <p className="text-xs text-gray-500 bg-gray-100 inline-block px-2 py-0.5 rounded mt-1">
                    {getDisplayName(qr.group_name)}
                  </p>
                </div>
                <span className={`px-2 py-1 text-xs rounded font-bold ${qr.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-500 text-white animate-pulse'}`}>
                  {qr.status === 'active' ? '正常' : '🚫 已受限'}
                </span>
              </div>
              
              <div className="my-4 flex items-center space-x-4">
                <div className="w-16 h-16 border rounded p-1 bg-white flex-shrink-0">
                  <img src={qr.image_url} className="w-full h-full object-contain" />
                </div>
                <div className="text-sm flex-1">
                  <div className="flex justify-between mb-1">
                    <span>今日收款次数</span>
                    <span className="font-mono font-bold">{qr.today_usage} / {qr.daily_limit}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className={`h-2 rounded-full ${qr.today_usage >= qr.daily_limit ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min((qr.today_usage / qr.daily_limit) * 100, 100)}%` }}></div>
                  </div>
                </div>
              </div>

              <div className="flex space-x-3 text-xs border-t border-gray-200/50 pt-3 mt-2">
                <button 
                  onClick={() => toggleStatus(qr.id, qr.status)} 
                  className={`flex-1 py-2 border rounded font-bold shadow-sm transition-colors ${qr.status === 'active' ? 'text-gray-700 hover:bg-gray-50' : 'bg-green-600 text-white border-green-600 hover:bg-green-700'}`}
                >
                  {qr.status === 'active' ? '🚫 设为受限' : '✅ 恢复正常'}
                </button>
                <button onClick={() => resetCount(qr.id)} className="px-3 py-2 border rounded hover:bg-white text-orange-600 font-bold bg-white/50">重置</button>
                <button onClick={() => deleteQr(qr.id)} className="px-3 py-2 border border-red-100 text-red-500 hover:bg-red-50 rounded bg-white/50">删除</button>
              </div>
            </div>
          ))}
        </div>
        
        {filteredQrs.length === 0 && (
          <div className="text-center py-20 text-gray-400">该分类下没有二维码</div>
        )}
      </div>
    </div>
  )
}