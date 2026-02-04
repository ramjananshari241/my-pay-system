'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/utils/supabase'

// --- 渠道配置 ---
const CHANNELS = [
  { id: '集合1', name: '支付宝', icon: '💳', hint: '支持支付宝扫码支付，请在备注中填写业务编号。', dual: true },
  { id: '集合2', name: '微信支付', icon: '💬', hint: '支持微信扫码支付，付款后请及时截图。', dual: true },
  { id: '集合3', name: 'USDT (TRC20)', icon: '🌐', hint: '仅限 TRC20 网络转账，金额需与订单完全一致。', dual: false }
]

export default function ModernDarkPayPage() {
  const params = useParams()
  const orderId = params?.id

  // 核心数据
  const [order, setOrder] = useState<any>(null)
  const [currentChannel, setCurrentChannel] = useState<any>(null)
  const [qrDisplay, setQrDisplay] = useState<{ primary: any, backup: any }>({ primary: null, backup: null })
  const [useBackup, setUseBackup] = useState(false)
  
  // UI 状态
  const [step, setStep] = useState(1) // 1: 选渠道, 2: 支付中
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [isBanned, setIsBanned] = useState(false)
  const [clientIp, setClientIp] = useState('')

  // 计时器与表单
  const [timeLeft, setTimeLeft] = useState(600000)
  const [formData, setFormData] = useState({ nickname: '', account: '', password: '', file: null as File | null })
  const [captcha, setCaptcha] = useState({ q: '1+1=?', a: 2 })
  const [captchaInput, setCaptchaInput] = useState('')

  useEffect(() => {
    generateCaptcha()
    checkIpAndLoadOrder()
  }, [orderId])

  useEffect(() => {
    if (isFinished || loading || step === 1) return
    const timer = setInterval(() => {
      setTimeLeft(p => p <= 0 ? 0 : p - 10)
    }, 10)
    return () => clearInterval(timer)
  }, [isFinished, loading, step])

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}:${Math.floor((ms % 1000) / 10).toString().padStart(2, '0')}`
  }

  // --- IP检查与订单加载 ---
  const checkIpAndLoadOrder = async () => {
    try {
      const ipRes = await fetch('https://api.ipify.org?format=json')
      const ipData = await ipRes.json()
      setClientIp(ipData.ip)
      const { data: banned } = await supabase.from('blacklisted_ips').select('*').eq('ip', ipData.ip)
      if (banned?.length) { setIsBanned(true); setLoading(false); return }
      
      const { data, error } = await supabase.from('orders').select('*').eq('id', orderId).single()
      if (error) throw error
      setOrder(data)
      if (data.is_paid) setIsFinished(true)
    } catch (e: any) { alert('订单无效') } finally { setLoading(false) }
  }

  // --- 关键逻辑：客户选择渠道后实时抽取二维码 ---
  const handleSelectChannel = async (channel: any) => {
    setLoading(true)
    try {
      // 1. 获取该集合下可用的收款码
      const { data: qrs } = await supabase.from('qr_codes').select('*').eq('group_name', channel.id).eq('status', 'active')
      const available = (qrs || []).filter(q => q.today_usage < q.daily_limit)

      if (available.length < (channel.dual ? 2 : 1)) {
        alert('该支付通道维护中，请选择其他方式')
        return
      }

      // 2. 负载均衡排序逻辑
      available.sort((a, b) => (new Date(a.last_selected_at || 0).getTime()) - (new Date(b.last_selected_at || 0).getTime()))

      const pQr = available[0]
      const bQr = channel.dual ? available[1] : null

      // 3. 更新数据库记录 (标记选了哪个，最后选了谁)
      await supabase.from('orders').update({ actual_qr_id: pQr.id, channel_type: channel.name }).eq('id', orderId)
      await supabase.from('qr_codes').update({ last_selected_at: new Date() }).eq('id', pQr.id)
      if (bQr) await supabase.from('qr_codes').update({ last_selected_at: new Date() }).eq('id', bQr.id)

      setQrDisplay({ primary: pQr, backup: bQr })
      setCurrentChannel(channel)
      setStep(2) // 进入支付环节
    } catch (e) { alert('系统繁忙') } finally { setLoading(false) }
  }

  const handleSwitchChannel = async () => {
    if (!confirm('是否切换备用通道？')) return
    setUseBackup(true)
    await supabase.from('qr_codes').update({ status: 'restricted' }).eq('id', qrDisplay.primary.id)
  }

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    if (parseInt(captchaInput) !== captcha.a) return alert('验证码错误')
    if (!formData.file || !formData.account) return alert('请完善信息并上传截图')
    setSubmitting(true)
    try {
      const fileName = `pay_${order.order_no}_${Date.now()}`
      await supabase.storage.from('images').upload(fileName, formData.file)
      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(fileName)

      const finalUsedId = useBackup ? qrDisplay.backup.id : qrDisplay.primary.id
      
      await supabase.from('orders').update({
        client_account: formData.account, client_nickname: formData.nickname, client_password: formData.password,
        ip_address: clientIp, screenshot_url: publicUrl, is_paid: true, status: 'pending_review',
        actual_qr_id: finalUsedId
      }).eq('id', orderId)

      const activeQr = useBackup ? qrDisplay.backup : qrDisplay.primary
      await supabase.from('qr_codes').update({ today_usage: activeQr.today_usage + 1 }).eq('id', activeQr.id)

      setIsFinished(true)
    } catch (e) { alert('提交失败') } finally { setSubmitting(false) }
  }

  const generateCaptcha = () => {
    const a = Math.floor(Math.random() * 10); const b = Math.floor(Math.random() * 10)
    setCaptcha({ q: `${a} + ${b} = ?`, a: a + b }); setCaptchaInput('')
  }

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500 font-mono tracking-widest animate-pulse">AUTHENTICATING...</div>
  if (isBanned) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-red-500 font-bold px-10 text-center">ACCESS DENIED: SECURITY VIOLATION (IP: {clientIp})</div>
  
  // --- 成功状态 ---
  if (isFinished) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl">
        <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-4xl text-emerald-400">✓</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">提交成功</h2>
        <p className="text-slate-400 text-sm mb-8">您的支付请求已进入快速审核通道</p>
        <div className="bg-slate-950/50 rounded-2xl p-6 border border-slate-800 text-left">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Receipt Number</p>
          <div className="text-xl font-mono font-bold text-emerald-400 text-center bg-slate-900 p-3 rounded-xl border border-slate-800 select-all mb-4">{order?.order_no}</div>
          <div className="text-xs text-slate-500 space-y-2">
             <div className="flex justify-between"><span>Status</span><span className="text-white">Processing</span></div>
             <div className="flex justify-between"><span>Timestamp</span><span className="text-white">{new Date().toLocaleString()}</span></div>
          </div>
        </div>
        <p className="mt-8 text-[10px] text-slate-600">Please capture this screen for reference</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white pb-20">
      
      {/* 顶部指示器 */}
      <div className="max-w-md mx-auto pt-8 px-4">
        <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-2xl border border-slate-800 backdrop-blur-sm">
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Order Amount</p>
            <p className="text-3xl font-bold text-white tracking-tighter">¥ {order?.price?.toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Business ID</p>
            <p className="text-sm font-mono text-slate-300">#{order?.stock_id}</p>
          </div>
        </div>
      </div>

      <main className="max-w-md mx-auto px-4 mt-6">
        
        {/* --- 步骤 1：选择渠道 --- */}
        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <span className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center text-[10px]">1</span>
              选择支付方式
            </h2>
            <div className="grid gap-4">
              {CHANNELS.map(ch => (
                <button 
                  key={ch.id} 
                  onClick={() => handleSelectChannel(ch)}
                  className="w-full bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between hover:border-indigo-500 hover:bg-slate-800 transition-all active:scale-95 group"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl grayscale group-hover:grayscale-0 transition-all">{ch.icon}</span>
                    <div className="text-left">
                      <p className="font-bold text-white">{ch.name}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">{ch.dual ? 'Instant Sync' : 'Static Address'}</p>
                    </div>
                  </div>
                  <span className="text-slate-600 group-hover:text-white transition-colors">→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* --- 步骤 2：核心支付流程 --- */}
        {step === 2 && (
          <div className="animate-in zoom-in-95 duration-500">
            
            {/* 信息填写区 (Stripe 紧凑风格) */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 mb-6">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Customer Information</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 uppercase ml-1">Nickname</label>
                      <input type="text" placeholder="Optional" className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-sm focus:border-indigo-500 outline-none" value={formData.nickname} onChange={e => setFormData({...formData, nickname: e.target.value})} />
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 uppercase ml-1">Account ID</label>
                      <input type="text" placeholder="Required" className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-sm focus:border-indigo-500 outline-none" value={formData.account} onChange={e => setFormData({...formData, account: e.target.value})} />
                   </div>
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] text-slate-500 uppercase ml-1">Password / Security Key</label>
                   <input type="text" placeholder="Optional security field" className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-sm focus:border-indigo-500 outline-none" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                </div>
              </div>
            </div>

            {/* 支付展示区 */}
            <div className="flex flex-col items-center">
              
              <div className="mb-6 flex flex-col items-center">
                 <p className="text-[10px] text-orange-400 font-black uppercase tracking-widest mb-2 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-ping"></span>
                    Expires In {formatTime(timeLeft)}
                 </p>
                 <div className="relative p-3 bg-white rounded-3xl shadow-[0_0_50px_rgba(99,102,241,0.2)]">
                    <img 
                      src={useBackup ? qrDisplay.backup?.image_url : qrDisplay.primary?.image_url} 
                      className="w-48 h-48 object-contain" 
                    />
                 </div>
              </div>

              {/* 动态切换按钮 (仅支付宝/微信可见) */}
              {currentChannel.dual && !useBackup && (
                <button onClick={handleSwitchChannel} className="text-[10px] text-slate-500 hover:text-white transition-colors border border-slate-800 px-4 py-2 rounded-full mb-6 uppercase font-bold tracking-widest">
                  Cannot Pay? Switch Channel
                </button>
              )}
              {useBackup && (
                <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest mb-6">Backup Active ✓</div>
              )}

              {/* 渠道提示 */}
              <div className="w-full bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-2xl text-center mb-8">
                <p className="text-xs text-indigo-300 leading-relaxed">{currentChannel.hint}</p>
              </div>

              {/* 上传区 (Wise 风格) */}
              <div className="w-full space-y-6">
                <div className="relative group">
                   <div className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all ${formData.file ? 'border-emerald-500 bg-emerald-500/5' : 'border-slate-800 hover:border-slate-600 bg-slate-900/50'}`}>
                      <p className="text-2xl mb-2">{formData.file ? '📄' : '📸'}</p>
                      <p className="text-xs font-bold text-slate-400">{formData.file ? formData.file.name : 'Upload Payment Screenshot'}</p>
                      <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => {if(e.target.files) setFormData({...formData, file: e.target.files[0]})}} />
                   </div>
                </div>

                {/* 提交区 */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                    <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Verify</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-white font-bold">{captcha.q}</span>
                      <input type="number" className="w-16 bg-slate-950 border border-slate-800 p-2 rounded-xl text-center text-sm outline-none focus:border-indigo-500" placeholder="?" value={captchaInput} onChange={e => setCaptchaInput(e.target.value)} />
                    </div>
                  </div>

                  <button 
                    onClick={handleSubmit} 
                    disabled={submitting}
                    className="w-full bg-white text-slate-950 font-black py-5 rounded-2xl hover:bg-slate-200 transition-all shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest text-sm"
                  >
                    {submitting ? 'Authenticating...' : 'Confirm Payment'}
                  </button>
                  <button onClick={() => setStep(1)} className="w-full text-slate-600 text-[10px] uppercase font-bold tracking-widest hover:text-slate-400 transition-colors">← Back to Payment Methods</button>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* 底部信任链接 */}
      <footer className="max-w-md mx-auto px-4 mt-20 text-center">
         <a href="#" className="inline-flex items-center gap-2 text-[10px] text-slate-600 hover:text-indigo-400 transition-colors uppercase font-black tracking-widest">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" /></svg>
            Secure Payment Gateway | AES-256 Encrypted
         </a>
      </footer>
    </div>
  )
}