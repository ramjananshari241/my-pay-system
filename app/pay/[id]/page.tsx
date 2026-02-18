'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/utils/supabase'

// --- 统一的绿色呼吸灯组件 ---
const BreathingDot = () => (
  <div className="relative flex h-3 w-3">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>
  </div>
)

const CHANNELS = [
  { 
    id: '集合1', 
    name: '支付宝 (Alipay)', 
    hint: '请使用支付宝扫码支付。支付时务必在备注中填写下方的【库存编号】。', 
    dual: true 
  },
  { 
    id: '集合2', 
    name: '微信支付 (WeChat)', 
    hint: '请保存二维码后打开微信扫码。支付完成后请务必上传【账单详情】页面截图。', 
    dual: true 
  },
  { 
    id: '集合3', 
    name: 'USDT (TRC20)', 
    hint: '当前仅支持 TRC20 网络转账。转账金额需与工单显示金额完全一致。', 
    dual: false 
  }
]

export default function StablePayPage() {
  const params = useParams()
  const orderId = params?.id

  // --- 数据状态 ---
  const [order, setOrder] = useState<any>(null)
  const [qrDisplay, setQrDisplay] = useState<{ primary: any, backup: any }>({ primary: null, backup: null })
  const [currentChannel, setCurrentChannel] = useState<any>(null)
  const [useBackup, setUseBackup] = useState(false)
  
  // --- UI/流程状态 ---
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false) // 提交锁
  const [showHintModal, setShowHintModal] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [isBanned, setIsBanned] = useState(false)
  const [clientIp, setClientIp] = useState('')
  const [timeLeft, setTimeLeft] = useState(600000) 
  
  // --- 表单文件 ---
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [captcha, setCaptcha] = useState({ q: '1+1=?', a: 2 })
  const [captchaInput, setCaptchaInput] = useState('')

  useEffect(() => {
    generateCaptcha()
    checkIpAndLoadOrder()
  }, [orderId])

  useEffect(() => {
    if (isFinished || loading || step !== 2) return
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
      setOrder(data)
      if (data.is_paid) { setStep(3); setIsFinished(true) }
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  // --- 修复点 1: 选渠道时只更新本地状态，不写数据库 ---
  const handleSelectChannel = async (channel: any) => {
    setLoading(true)
    try {
      // 获取该集合的码
      const { data: qrs } = await supabase.from('qr_codes').select('*').eq('group_name', channel.id).eq('status', 'active')
      const available = (qrs || []).filter(q => q.today_usage < q.daily_limit)
      
      if (available.length < (channel.dual ? 2 : 1)) {
        return alert('该支付通道正如火如荼，请稍后重试或选择其他方式')
      }

      // 排序：优先选最久没用的
      available.sort((a, b) => (new Date(a.last_selected_at || 0).getTime()) - (new Date(b.last_selected_at || 0).getTime()))
      
      const pQr = available[0]
      const bQr = channel.dual ? available[1] : null

      // 只更新本地 React 状态
      setQrDisplay({ primary: pQr, backup: bQr })
      setCurrentChannel(channel)
      setStep(2)
      setShowHintModal(true)
      
      // 清空之前的残留输入（如果有）
      setFile(null)
      setPreviewUrl(null)
      setCaptchaInput('')
      setUseBackup(false)
    } finally { 
      setLoading(false) 
    }
  }

  const handleSwitchChannel = async () => {
    if (!confirm('是否切换备用通道？')) return
    setUseBackup(true)
    // 这里也不要写数据库，只在前端切换显示
  }

  // --- 修复点 2: 处理“返回”逻辑 ---
  const handleBack = () => {
    setStep(1)
    setFile(null)
    setPreviewUrl(null)
    setUseBackup(false)
    // 不操作数据库，保持纯净
  }

  // --- 修复点 3: 提交时一次性写入所有数据 (原子操作) ---
  const handleSubmit = async () => {
    if (submitting) return
    if (parseInt(captchaInput) !== captcha.a) return alert('验证码错误')
    if (!file) return alert('请上传凭证')
    
    setSubmitting(true)
    try {
      // 1. 上传图片
      const ext = file.name.split('.').pop()
      // 使用强随机文件名，防止冲突
      const fileName = `pay_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      
      const { error: upError } = await supabase.storage.from('images').upload(fileName, file)
      if (upError) throw upError

      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(fileName)

      // 2. 确定最终使用的二维码
      const finalQr = useBackup ? qrDisplay.backup : qrDisplay.primary
      
      // 3. 此时才更新数据库 (关键步骤)
      // 更新订单信息
      const { error: dbError } = await supabase.from('orders').update({
        ip_address: clientIp, 
        screenshot_url: publicUrl, 
        is_paid: true, 
        status: 'pending_review', 
        actual_qr_id: finalQr.id, 
        channel_type: currentChannel.name
      }).eq('id', orderId)
      
      if (dbError) throw dbError

      // 4. 更新二维码数据 (计数 + 标记受限 + 更新时间)
      // 如果切换过备用通道，把主通道标记受限
      if (useBackup && qrDisplay.primary) {
         await supabase.from('qr_codes').update({ status: 'restricted' }).eq('id', qrDisplay.primary.id)
      }
      
      // 增加使用次数 + 更新最后使用时间
      await supabase.from('qr_codes').update({ 
        today_usage: finalQr.today_usage + 1,
        last_selected_at: new Date()
      }).eq('id', finalQr.id)

      setStep(3)
      setIsFinished(true)
    } catch (e: any) { 
      console.error(e)
      alert('提交失败，请重试') 
    } finally { 
      setSubmitting(false) 
    }
  }

  const generateCaptcha = () => {
    const a = Math.floor(Math.random() * 10); const b = Math.floor(Math.random() * 10)
    setCaptcha({ q: `${a} + ${b} = ?`, a: a + b }); setCaptchaInput('')
  }

  const SummaryCard = () => (
    <div className="bg-white rounded-[2rem] border border-gray-100 p-8 mb-4 text-center shadow-sm relative overflow-hidden">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em] mb-2">ORDER SUMMARY</p>
        <div className="flex items-baseline justify-center mb-3">
            <span className="text-xl mr-2 text-gray-300 font-light">¥</span>
            <span className="text-5xl font-semibold tracking-tight tabular-nums text-gray-900">{order?.price?.toFixed(2)}</span>
        </div>
        <div className="inline-block bg-gray-50 px-4 py-1.5 rounded-full border border-gray-100">
            <span className="text-[10px] font-mono font-bold text-gray-500 tracking-wider uppercase">Business ID: {order?.stock_id || '-'}</span>
        </div>
    </div>
  )

  // 处理文件预览
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setPreviewUrl(URL.createObjectURL(e.target.files[0]))
    }
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 font-mono tracking-widest uppercase font-black animate-pulse">Initializing Terminal...</div>

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-black selection:text-white pb-20">
      
      <nav className="max-w-md mx-auto pt-10 px-8">
        <div className="flex justify-between items-center relative">
          <div className="absolute top-3 left-0 w-full h-[1px] bg-gray-200 -z-10"></div>
          {[{ s: 1, n: '渠道' }, { s: 2, n: '支付' }, { s: 3, n: '完成' }].map((item) => (
            <div key={item.s} className="flex flex-col items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all duration-700 border-2 ${step >= item.s ? 'bg-black border-black text-white shadow-lg' : 'bg-white border-gray-200 text-gray-300'}`}>{step > item.s ? '✓' : item.s}</div>
              <span className={`text-[10px] font-bold tracking-tighter uppercase ${step >= item.s ? 'text-black' : 'text-gray-300'}`}>{item.n}</span>
            </div>
          ))}
        </div>
      </nav>

      {showHintModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-10 shadow-2xl animate-in fade-in zoom-in border border-gray-100 text-center">
            <div className="text-2xl mb-4 text-emerald-500">🛡️</div>
            <h3 className="text-lg font-bold mb-4 text-gray-900 uppercase tracking-tighter">Secure Instructions</h3>
            <p className="text-gray-500 text-sm leading-relaxed mb-10 font-medium">{currentChannel?.hint}</p>
            <button onClick={() => setShowHintModal(false)} className="w-full bg-black text-white font-bold py-4 rounded-2xl hover:opacity-80 active:scale-95 transition-all uppercase tracking-widest text-xs">Acknowledge</button>
          </div>
        </div>
      )}

      <main className="max-w-md mx-auto px-6 mt-8">
        
        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <SummaryCard />
            <div className="grid gap-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-4 mb-1">Select Active Gateway</p>
              {CHANNELS.map(ch => (
                <button key={ch.id} onClick={() => handleSelectChannel(ch)} className="w-full bg-white border border-gray-100 p-6 rounded-[1.8rem] flex items-center justify-between hover:border-gray-300 hover:shadow-md transition-all active:scale-[0.98] group shadow-sm">
                  <div className="flex items-center gap-5">
                    <BreathingDot />
                    <span className="font-bold text-gray-700 group-hover:text-black transition-colors">{ch.name}</span>
                  </div>
                  <span className="text-gray-300 group-hover:text-black transition-transform group-hover:translate-x-1">→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in fade-in zoom-in-95 duration-500">
            <SummaryCard />
            
            <div className="flex flex-col items-center">
              <div className="w-full bg-white rounded-[2.5rem] border border-gray-100 p-8 flex flex-col items-center mb-6 shadow-sm">
                 <div className="mb-4 px-4 py-1.5 bg-gray-50 border border-gray-100 rounded-full">
                    <span className="font-mono text-[11px] text-gray-400 font-bold tracking-widest">{formatTime(timeLeft)}</span>
                 </div>

                 <div className="relative bg-white p-4 rounded-[2rem] border border-gray-100 shadow-inner mb-2 group">
                    <img src={useBackup ? qrDisplay.backup?.image_url : qrDisplay.primary?.image_url} className="w-52 h-52 object-contain transition-opacity duration-500" />
                 </div>
                 
                 {/* 蓝色大按钮 */}
                 <div className="mb-6 w-full flex justify-center">
                    {currentChannel.dual && !useBackup ? (
                      <button 
                        onClick={handleSwitchChannel} 
                        className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all text-xs flex items-center justify-center gap-2 active:scale-95"
                      >
                        <span>⚠️</span> 无法支付？点击切换通道
                      </button>
                    ) : useBackup ? (
                      <div className="w-full bg-emerald-50 text-emerald-600 font-bold py-3 rounded-xl border border-emerald-100 text-center text-xs flex items-center justify-center gap-2">
                        <span>🛡️</span> 已启用安全备用通道
                      </div>
                    ) : null}
                 </div>

                 <div className="w-full border-t border-dashed border-gray-100 mb-6"></div>

                 {/* 扁平化上传条 */}
                 <div className="w-full">
                    <div className={`relative border-2 border-dashed rounded-2xl px-4 py-4 text-center transition-all min-h-[64px] flex items-center justify-center overflow-hidden ${file ? 'border-emerald-500 bg-emerald-50/50' : 'border-red-100 bg-red-50/30 hover:border-red-200'}`}>
                        {previewUrl ? (
                            <div className="flex items-center gap-3 animate-in fade-in">
                                <img src={previewUrl} className="w-10 h-10 rounded-lg object-cover border border-emerald-200 shadow-sm" />
                                <span className="text-[11px] font-bold text-emerald-600">凭证载入成功 ✓</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 animate-pulse text-red-500">
                                <span className="text-lg">📷</span>
                                <span className="text-[11px] font-black uppercase tracking-tighter">请务必点击此处：上传支付成功截图</span>
                            </div>
                        )}
                        <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileChange} />
                    </div>
                 </div>
              </div>

              <div className="w-full space-y-4">
                <div className="flex items-center justify-between bg-white border border-gray-100 p-5 rounded-2xl shadow-sm">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Bot Check</span>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-gray-800 text-sm font-bold">{captcha.q}</span>
                      <input type="number" className="w-16 bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-center text-sm outline-none focus:border-black text-black font-black" placeholder="?" value={captchaInput} onChange={e => setCaptchaInput(e.target.value)} />
                    </div>
                </div>
                <button onClick={handleSubmit} disabled={submitting} className={`w-full py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-xs transition-all shadow-xl shadow-black/5 ${submitting ? 'bg-gray-100 text-gray-400 cursor-wait' : 'bg-black text-white hover:opacity-80 active:scale-[0.98]'}`}>
                  {submitting ? 'PROCESSING...' : 'Confirm & Dispatch'}
                </button>
                {/* 修复返回按钮逻辑 */}
                <button onClick={handleBack} className="w-full text-center text-[9px] text-gray-400 font-bold uppercase tracking-widest hover:text-black py-2 transition-colors font-mono">← Return to selection</button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: 完成页 */}
        {step === 3 && (
          <div className="animate-in zoom-in-95 duration-700 flex flex-col items-center py-10 text-center">
            <div className="w-20 h-20 bg-black rounded-full flex items-center justify-center mb-8 shadow-2xl border border-gray-800"><span className="text-4xl text-white">✓</span></div>
            <h2 className="text-2xl font-black mb-3 tracking-tighter text-gray-900 uppercase italic">Dispatch Success</h2>
            <p className="text-gray-400 text-sm mb-12 px-8 leading-relaxed font-medium">工单已进入审核序列，请保存单号耐心等待处理。</p>
            <div className="w-full bg-white border border-gray-100 p-10 rounded-[2.5rem] shadow-xl relative overflow-hidden">
               <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.3em] mb-4">Tracking Number</p>
               <div className="text-2xl font-mono font-black text-black tracking-tighter select-all border-b border-gray-50 pb-6 mb-8">{order?.order_no}</div>
               <div className="flex justify-between text-[9px] font-bold text-gray-400 uppercase tracking-widest font-mono"><span>STATUS: AWAITING</span><span>ID: #{order?.id}</span></div>
            </div>
            <button onClick={()=>window.location.reload()} className="mt-16 text-[9px] font-black uppercase text-gray-500 hover:text-black transition-all tracking-[0.3em] border-b border-gray-200 pb-1">Reset Session</button>
          </div>
        )}

      </main>

      <footer className="max-w-md mx-auto px-4 mt-24 text-center">
         <a href="/safe" target="_blank" className="inline-flex items-center gap-2 text-[9px] text-gray-400 hover:text-black font-bold uppercase tracking-widest transition-all duration-300">
            <svg className="w-3.5 h-3.5 fill-gray-400 hover:fill-black transition-colors" viewBox="0 0 20 20"><path d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" /></svg>
            <span>安全支付系统 | 资金第三方托管监控中</span>
         </a>
      </footer>
    </div>
  )
}