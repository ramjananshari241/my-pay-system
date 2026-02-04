'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase'

export default function PerformancePage() {
  const [stats, setStats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // --- 新增：日期筛选状态 ---
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-12

  useEffect(() => {
    calculateStats()
  }, [year, month]) // 当年份或月份改变时，重新计算

  const calculateStats = async () => {
    setLoading(true)
    try {
      // 1. 计算所选月份的开始和结束时间
      // 开始时间：YYYY-MM-01 00:00:00
      const startDate = new Date(year, month - 1, 1).toISOString()
      // 结束时间：下个月的 1 号 00:00:00 (即本月最后时刻)
      const endDate = new Date(year, month, 1).toISOString()

      // 2. 查询数据：已完成 + 在时间范围内
      const { data, error } = await supabase
        .from('orders')
        .select('price, creator_name')
        .eq('status', 'completed')
        .gte('created_at', startDate)
        .lt('created_at', endDate)

      if (error) throw error

      if (data) {
        const report: any = {}
        data.forEach(order => {
          const name = order.creator_name || '未知/已删人员'
          if (!report[name]) report[name] = { name, total: 0, count: 0 }
          report[name].total += order.price
          report[name].count += 1
        })
        setStats(Object.values(report).sort((a: any, b: any) => b.total - a.total))
      }
    } catch (err: any) {
      console.error(err)
      alert('统计失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // 生成年份选项 (今年及过去 2 年)
  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2]
  // 生成月份选项 (1-12)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className="p-10 bg-slate-950 min-h-screen text-white font-sans selection:bg-indigo-500">
      <div className="max-w-4xl mx-auto">
        
        {/* 标题区域 */}
        <div className="mb-10 text-center">
          <p className="text-[10px] text-slate-500 uppercase font-black tracking-[0.4em] mb-4">Financial Intelligence</p>
          <h1 className="text-4xl font-black italic uppercase tracking-tighter">业绩报表查询</h1>
        </div>

        {/* --- 日期筛选器 --- */}
        <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-slate-800 mb-8 flex flex-wrap justify-center items-center gap-6 shadow-2xl">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-slate-500 uppercase">Year</span>
            <select 
              value={year} 
              onChange={(e) => setYear(Number(e.target.value))}
              className="bg-slate-950 border border-slate-800 p-2 px-4 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 transition-all"
            >
              {years.map(y => <option key={y} value={y}>{y} 年</option>)}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-slate-500 uppercase">Month</span>
            <select 
              value={month} 
              onChange={(e) => setMonth(Number(e.target.value))}
              className="bg-slate-950 border border-slate-800 p-2 px-4 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 transition-all"
            >
              {months.map(m => <option key={m} value={m}>{m} 月</option>)}
            </select>
          </div>

          <button 
            onClick={calculateStats}
            className="bg-white text-black px-6 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-indigo-50 transition-all active:scale-95"
          >
            Refresh Data
          </button>
        </div>

        {/* 统计列表 */}
        <div className="grid gap-4">
          {loading ? (
            <div className="py-20 text-center text-slate-600 font-mono text-xs animate-pulse uppercase tracking-widest">
              Processing Database...
            </div>
          ) : stats.length === 0 ? (
            <div className="py-20 text-center bg-slate-900/30 rounded-[2rem] border border-dashed border-slate-800 text-slate-600">
              该月份暂无成功订单数据
            </div>
          ) : (
            stats.map(s => (
              <div key={s.name} className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] flex justify-between items-center hover:border-indigo-500 transition-all group shadow-xl">
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 group-hover:text-indigo-400">Agent Name</p>
                  <h3 className="text-2xl font-bold">{s.name}</h3>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 group-hover:text-indigo-400">Monthly Turnover</p>
                  <p className="text-4xl font-black text-white tracking-tighter italic">¥ {s.total.toLocaleString()}</p>
                  <p className="text-[10px] text-slate-500 font-bold mt-2 bg-slate-950 inline-block px-3 py-1 rounded-full border border-slate-800">
                    ORDERS: {s.count}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 总计面板 */}
        {!loading && stats.length > 0 && (
          <div className="mt-12 p-10 bg-indigo-600 rounded-[3rem] shadow-2xl shadow-indigo-500/20 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 group-hover:bg-white/20 transition-all"></div>
            <div className="flex flex-col md:flex-row justify-between items-center relative z-10 gap-6 text-center md:text-left">
              <div>
                <p className="font-black uppercase tracking-[0.3em] text-[10px] text-indigo-200 mb-2">Total Monthly Revenue</p>
                <h2 className="text-xs font-bold text-white/70">{year}年 {month}月 平台总流水合计</h2>
              </div>
              <span className="text-5xl font-black italic tracking-tighter text-white">
                ¥ {stats.reduce((acc, curr) => acc + curr.total, 0).toLocaleString()}
              </span>
            </div>
          </div>
        )}

        <footer className="mt-20 text-center opacity-30">
          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest font-mono">
            Generated by POMS Security Node 4.2.0
          </p>
        </footer>
      </div>
    </div>
  )
}