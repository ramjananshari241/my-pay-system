'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase'

export default function PerformancePage() {
  const [stats, setStats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const calculateStats = async () => {
      // 1. 获取本月第一天的时间
      const now = new Date()
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      // 2. 仅查询本月已成功的订单
      const { data, error } = await supabase
        .from('orders')
        .select('price, creator_name')
        .eq('status', 'completed')
        .gte('created_at', firstDay)

      if (data) {
        // 3. 统计逻辑：按名字分组汇总金额
        const report: any = {}
        data.forEach(order => {
          const name = order.creator_name || '未知'
          if (!report[name]) report[name] = { name, total: 0, count: 0 }
          report[name].total += order.price
          report[name].count += 1
        })
        setStats(Object.values(report).sort((a:any, b:any) => b.total - a.total))
      }
      setLoading(false)
    }
    calculateStats()
  }, [])

  return (
    <div className="p-10 bg-slate-50 min-h-screen text-slate-900 font-sans">
      <div className="max-w-4xl mx-auto">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-black uppercase tracking-tighter">Performance Metrics / 客服业绩</h1>
          <p className="text-slate-400 text-sm mt-2 font-mono">Statistical cycle: {new Date().getMonth() + 1}月 (Current Month)</p>
        </div>

        <div className="grid gap-4">
          {loading ? <p className="text-center animate-pulse">Calculating...</p> : 
            stats.map(s => (
              <div key={s.name} className="bg-white border border-slate-200 p-6 rounded-[2rem] flex justify-between items-center shadow-sm">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Agent Name</p>
                  <h3 className="text-xl font-bold">{s.name}</h3>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Transaction Value</p>
                  <p className="text-3xl font-black text-indigo-600">¥ {s.total.toLocaleString()}</p>
                  <p className="text-[10px] text-slate-400 font-bold mt-1">SUCCESSFUL ORDERS: {s.count}</p>
                </div>
              </div>
            ))
          }
        </div>

        <div className="mt-10 p-6 bg-indigo-900 text-white rounded-[2rem] shadow-2xl">
          <div className="flex justify-between items-center">
            <span className="font-bold uppercase tracking-widest text-xs opacity-70">Total Platform Revenue (Monthly)</span>
            <span className="text-3xl font-black italic">¥ {stats.reduce((acc, curr) => acc + curr.total, 0).toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  )
}