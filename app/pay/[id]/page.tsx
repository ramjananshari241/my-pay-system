'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/utils/supabase'

const CHANNELS = [
  { id: '集合1', name: '支付宝', icon: '💳', hint: '请使用支付宝扫码，转入正确金额，不要多也不要少。如当前通道支付受限（如风控、限制收款等）请点击上方按钮切换备用通道', dual: true },
  { id: '集合2', name: '微信支付', icon: '💬', hint: '请扫码添加好友后转账，请不要向收款账号发送任何消息！如当前通道支付受限（如风控、限制收款等）请点击上方按钮切换备用通道', dual: true },
  { id: '集合3', name: 'USDT (TRC20)', icon: '🌐', hint: '仅支持 TRC20 网络，请注意转账金额与工单一致。', dual: false }
]

export default function ModernDarkPayPage() {
  const params = useParams()
  const orderId = params?.id

  const [order, setOrder] = useState<any>(null)
  const [qrDisplay, setQrDisplay] = useState<{ primary: any, backup: any }>({ primary: null, backup: null })
  const [currentChannel, setCurrentChannel] = useState<any>(null)
  const [useBackup, setUseBackup] = useState(false)
  
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [isBanned, setIsBanned] = useState(false)
  const [clientIp, setClientIp] = useState('')
  const [timeLeft, setTimeLeft] = useState(600000)
  const [file, setFile] = useState<File | null>(null)
  
  // --- 新增：图片预览地址 ---
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const [captcha, setCaptcha] = useState({ q: '1+1=?', a: 2 })
  const [captchaInput, setCaptchaInput] = useState('')

  useEffect(() => {
    generateCaptcha()
    checkIpAndLoadOrder()
  }, [orderId])

  useEffect(() => {
    if (isFinished || loading || step === 1) return
    const timer = setInterval(() => { setTimeLeft(p => p <= 0 ? 0 : p - 10) }, 10)
    return () => clearInterval(timer)
  }, [isFinished, loading, step])

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}:${Math.floor((ms % 1000) / 10).toString().padStart(2, '0')}`
  }

  const checkIpAndLoadOrder = async () => {
    try {
      const ipRes = await fetch('https://api.ipify.org?format=json')
      const ipData = await ipRes.json(); setClientIp(ipData.ip)
      const { data: banned } = await supabase.from('blacklisted_ips').select('*').eq('ip', ipData.ip)
      if (banned?.length) { setIsBanned(true); setLoading(false); return }
      const { data, error } = await supabase.from('orders').select('*').eq('id', orderId).single()
      if (error) throw error
      setOrder(data); if (data.is_paid) setIsFinished(true)
    } finally { setLoading(false) }
  }

  const handleSelectChannel = async (channel: any) => {
    setLoading(true)
    try {
      const { data: qrs } = await supabase.from('qr_codes').select('*').eq('group_name', channel.id).eq('status', 'active')
      const available = (qrs || []).filter(q => q.today_usage < q.daily_limit)
      if (available.length < (channel.dual ? 2 : 1)) return alert('通道维护中')
      available.sort((a, b) => (new Date(a.last_selected_at || 0).getTime()) - (new Date(b.last_selected_at || 0).getTime()))
      const pQr = available[0]; const bQr = channel.dual ? available[1] : null
      await supabase.from('orders').update({ channel_type: channel.name }).eq('id', orderId)
      await supabase.from('qr_codes').update({ last_selected_at: new Date() }).eq('id', pQr.id)
      if (bQr) await supabase.from('qr_codes').update({ last_selected_at: new Date() }).eq('id', bQr.id)
      setQrDisplay({ primary: pQr, backup: bQr }); setCurrentChannel(channel); setStep(2)
    } finally { setLoading(false) }
  }

  const handleSwitchChannel = async () => {
    if (!confirm('是否切换备用通道？')) return
    setUseBackup(true)
    await supabase.from('qr_codes').update({ status: 'restricted' }).eq('id', qrDisplay.primary.id)
  }

  // --- 处理文件上传及预览 ---
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      // 创建预览图链接
      setPreviewUrl(URL.createObjectURL(selectedFile))
    }
  }

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    if (parseInt(captchaInput) !== captcha.a) return alert('验证码错误')
    if (!file) return alert('请上传支付截图')
    setSubmitting(true)
    try {
      const fileName = `pay_${order.order_no}_${Date.now()}`
      await supabase.storage.from('images').upload(fileName, file)
      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(fileName)
      const finalQr = useBackup ? qrDisplay.backup : qrDisplay.primary
      await supabase.from('orders').update({
        ip_address: clientIp, screenshot_url: publicUrl, is_paid: true, status: 'pending_review', actual_qr_id: finalQr.id
      }).eq('id', orderId)
      await supabase.from('qr_codes').update({ today_usage: finalQr.today_usage + 1 }).eq('id', finalQr.id)
      setIsFinished(true)
    } finally { setSubmitting(false) }
  }

  const generateCaptcha = () => {
    const a = Math.floor(Math.random() * 10); const b = Math.floor(Math.random() * 10)
    setCaptcha({ q: `${a} + ${b} = ?`, a: a + b }); setCaptchaInput('')
  }

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-600 font-mono tracking-widest animate-pulse font-black">AUTHENTICATING...</div>
  if (isBanned) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-red-500 font-black p-10 text-center uppercase tracking-tighter">Access Denied</div>

  if (isFinished) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 text-center shadow-2xl">
        <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/20"><span className="text-4xl text-emerald-500">✓</span></div>
        <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">提交成功</h2>
        <p className="text-slate-500 text-xs mb-8 uppercase font-black tracking-widest opacity-60">请回到客服聊天窗口获取库存链接</p>
        <div className="bg-slate-950 p-6 rounded-3xl border border-slate-800 text-left relative overflow-hidden">
          <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] mb-3">请保存您的订单编号</p>
          <div className="text-2xl font-mono font-black text-emerald-400 tracking-tighter select-all">{order?.order_no}</div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-white selection:text-black pb-20">
      <header className="max-w-md mx-auto pt-10 px-6 text-center">
        <p className="text-[10px] text-slate-500 uppercase font-black tracking-[0.4em] mb-6 opacity-40">Secure Terminal</p>
        <div className="bg-slate-900 border border-slate-800 p-10 rounded-[3rem] shadow-inner relative overflow-hidden">
           {/* 背景装饰 */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl rounded-full"></div>
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3">Payable Amount</p>
          <div className="flex items-baseline justify-center text-white">
            <span className="text-2xl font-light mr-2 opacity-30 italic font-mono">CNY</span>
            <span className="text-6xl font-medium tracking-tighter tabular-nums font-mono">{order?.price?.toFixed(2)}</span>
          </div>
          <div className="mt-8 flex justify-center">
            <span className="text-[10px] bg-black/50 border border-slate-800 px-4 py-1.5 rounded-full text-slate-500 font-mono tracking-tighter">#{order?.stock_id}</span>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 mt-8">
        {step === 1 ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h2 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-6 ml-1">Select Gateway</h2>
            <div className="grid gap-4">
              {CHANNELS.map(ch => (
                <button key={ch.id} onClick={() => handleSelectChannel(ch)} className="w-full bg-slate-900 border border-slate-800 p-6 rounded-[2rem] flex items-center justify-between hover:bg-slate-800 hover:border-slate-700 transition-all active:scale-95 group">
                  <div className="flex items-center gap-5">
                    <span className="text-3xl grayscale group-hover:grayscale-0 transition-all duration-500">{ch.icon}</span>
                    <div className="text-left">
                      <p className="font-bold text-white text-lg tracking-tight">{ch.name}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest opacity-40 italic">Instant Sync</p>
                    </div>
                  </div>
                  <span className="text-slate-700 group-hover:text-white transition-colors">→</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="animate-in zoom-in-95 duration-500">
            <div className="flex flex-col items-center">
              <div className="mb-10 flex flex-col items-center">
                 <p className="text-[10px] text-orange-500 font-black uppercase tracking-[0.3em] mb-5 flex items-center gap-2">
                    <span className="w-2 h-2 bg-orange-500 rounded-full animate-ping"></span>
                    Expires: {formatTime(timeLeft)}
                 </p>
                 <div className="relative p-5 bg-white rounded-[3rem] shadow-[0_0_100px_rgba(255,255,255,0.05)]">
                    <img src={useBackup ? qrDisplay.backup?.image_url : qrDisplay.primary?.image_url} className="w-52 h-52 object-contain" />
                 </div>
              </div>

              {currentChannel.dual && !useBackup && (
                <button onClick={handleSwitchChannel} className="text-[10px] text-slate-500 hover:text-white transition-colors border border-slate-800 px-6 py-3 rounded-full mb-8 uppercase font-black tracking-[0.2em]">无法付款？点击此处切换到备用通道</button>
              )}
              {useBackup && <div className="text-[10px] text-emerald-400 font-black uppercase tracking-[0.2em] mb-8 flex items-center gap-2">🛡️ Security Backup Enabled</div>}

              <div className="w-full bg-slate-900 border border-slate-800 p-6 rounded-3xl text-center mb-10">
                <p className="text-[11px] text-indigo-300/70 font-medium leading-relaxed italic tracking-wide">"{currentChannel.hint}"</p>
              </div>

              <div className="w-full space-y-6">
                <div className="relative">
                   {/* 核心：缩略图预览展示逻辑 */}
                   <div className={`border-2 border-dashed rounded-[2rem] p-10 text-center transition-all duration-500 overflow-hidden min-h-[200px] flex flex-col items-center justify-center ${file ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-800 hover:border-slate-600 bg-slate-900/50'}`}>
                      {previewUrl ? (
                         <div className="relative w-full h-full">
                            <img src={previewUrl} className="max-h-48 rounded-xl object-contain shadow-lg mb-3" />
                            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Image Ready ✓</p>
                         </div>
                      ) : (
                         <>
                            <p className="text-3xl mb-3">📁</p>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">请点击此处上传支付截图</p>
                         </>
                      )}
                      <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={onFileChange} />
                   </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-5 rounded-3xl">
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">请在右侧输入正确答案</span>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-white font-bold tracking-tighter">{captcha.q}</span>
                      <input type="number" className="w-20 bg-slate-950 border border-slate-800 p-3 rounded-2xl text-center text-sm outline-none focus:border-white transition-all text-white font-black" placeholder="?" value={captchaInput} onChange={e => setCaptchaInput(e.target.value)} />
                    </div>
                  </div>

                  <button onClick={handleSubmit} disabled={submitting} className="w-full bg-white text-black font-black py-6 rounded-3xl hover:bg-slate-200 transition-all shadow-2xl active:scale-95 disabled:opacity-30 uppercase tracking-[0.3em] text-xs">
                    {submitting ? 'Encrypting...' : '确定已支付'}
                  </button>
                  <button onClick={() => setStep(1)} className="w-full text-slate-700 text-[10px] uppercase font-black tracking-widest hover:text-slate-400 transition-colors py-4">← 更换支付方式</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}