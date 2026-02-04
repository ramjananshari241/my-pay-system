'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminDashboardPage() {
  const [password, setPassword] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    const loginStatus = localStorage.getItem('admin_logged_in')
    if (loginStatus === 'true') setIsLoggedIn(true)
  }, [])

  const handleLogin = (e: any) => {
    e.preventDefault()
    if (password === 'admin888') { 
      localStorage.setItem('admin_logged_in', 'true')
      setIsLoggedIn(true)
    } else {
      alert('密码错误')
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('admin_logged_in')
    setIsLoggedIn(false)
    setPassword('')
  }

  if (isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-10 flex flex-col items-center justify-center font-sans">
        <div className="max-w-5xl w-full text-center">
          <p className="text-[10px] text-slate-500 uppercase font-black tracking-[0.4em] mb-4">Central Command Center</p>
          <h1 className="text-4xl font-black mb-12 tracking-tight italic uppercase">控制台首页</h1>
          
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              { title: '创建工单', desc: '录入信息并生成支付链接', link: '/admin/create-order', icon: '📝' },
              { title: '订单管理', desc: '实时监控 / 审核 / 封禁IP', link: '/admin/orders', icon: '🔍' },
              { title: '收款码管理', desc: '修改名称 / 状态 / 重置次数', link: '/admin/qr-manager', icon: '⚙️' },
              { title: '添加收款码', desc: '上传新的二维码图片', link: '/admin/qr', icon: '➕' },
              // --- 新增：员工管理模块 ---
              { title: '员工管理', desc: '配置客服员工库 (业绩关联)', link: '/admin/staff', icon: '👥' },
              { title: '业绩统计', desc: '查看本月客服流水报表', link: '/admin/performance', icon: '📊' }
            ].map((item, index) => (
              <a 
                key={index}
                href={item.link}
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-slate-900 p-8 rounded-[2rem] border border-slate-800 hover:border-indigo-500 hover:bg-slate-800 transition-all group text-left shadow-xl hover:shadow-indigo-500/10 cursor-pointer"
              >
                <div className="text-3xl mb-4 group-hover:scale-110 transition-transform duration-500">{item.icon}</div>
                <div className="text-xl font-bold mb-2 tracking-tight text-white">{item.title}</div>
                <div className="text-slate-500 text-xs leading-relaxed">{item.desc}</div>
              </a>
            ))}
          </div>

          <button onClick={handleLogout} className="mt-20 text-slate-600 hover:text-white underline text-[10px] font-black uppercase tracking-widest transition-colors">Sign Out Security Session</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <form onSubmit={handleLogin} className="bg-slate-900 p-12 rounded-[3rem] border border-slate-800 w-full max-w-sm text-center shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500"></div>
        <h1 className="text-2xl font-black text-white mb-10 tracking-widest uppercase italic">Admin Login</h1>
        <input 
          type="password" 
          placeholder="ENTER ACCESS KEY" 
          className="w-full p-4 rounded-2xl mb-6 bg-slate-950 text-white border border-slate-800 focus:border-indigo-500 outline-none text-center tracking-widest transition-all font-mono"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <button className="w-full bg-white text-black p-4 rounded-2xl font-black hover:bg-indigo-50 transition-all shadow-lg text-xs uppercase tracking-widest">Authorize Access</button>
      </form>
    </div>
  )
}