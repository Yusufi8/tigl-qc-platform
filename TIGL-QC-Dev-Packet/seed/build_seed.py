import json, copy
P=[]  # helper
def q(label,qty,**k):
    d=dict(label=label,type="qty",expected=qty,unit="nos",mandatory=True); d.update(k); return d
def rng(label,mn,mx,unit,**k): d=dict(label=label,type="range",min=mn,max=mx,unit=unit,mandatory=True); d.update(k); return d
def yn(label,**k): d=dict(label=label,type="yes_no",expected="Yes",mandatory=True); d.update(k); return d
def pf(label,criteria="",**k): d=dict(label=label,type="pass_fail",criteria=criteria,mandatory=True); d.update(k); return d
def sel(label,opts,accept=None,**k): d=dict(label=label,type="select",options=opts,accept=accept or opts,mandatory=True); d.update(k); return d
def txt(label,**k): d=dict(label=label,type="text",mandatory=True); d.update(k); return d
def ex(label,val,unit="",**k): d=dict(label=label,type="exact",expected=val,unit=unit,mandatory=True); d.update(k); return d

GBMAKE=["Bonfiglioli","Super Sales","Transtech"]
MOTMAKE=["Dharani","ABB","Siemens"]
def cutter_drive(n):
    out=[]
    for i in range(1,n+1):
        s=f" #{i}" if n>1 else ""
        out+= [q(f"Gear box W63/12{s}",1),sel(f"Gear box make{s}",GBMAKE[:2]),ex(f"Gear box ratio{s}","12:1"),ex(f"Gear box type{s}","W63"),
               txt(f"Gear box code{s}",mandatory=False),txt(f"Gear box mount{s}",mandatory=False),txt(f"Gear box batch{s}",mandatory=False),
               rng(f"Gear box run out{s}",0,0.02,"mm",critical=True),
               q(f"Motor 1 HP, 1440 RPM, flange mounting{s}",1),sel(f"Motor make{s}",MOTMAKE),ex(f"Motor power{s}",1,"HP"),ex(f"Motor speed{s}",1440,"RPM"),
               txt(f"Motor serial no.{s}",evidence=True,hint="Photo of nameplate"),ex(f"Motor voltage{s}",415,"V"),ex(f"Motor insulation class{s}","F"),
               ex(f"Motor rating{s}",0.75,"kW"),sel(f"Motor efficiency grade{s}",["IE2","IE3"])]
    return out

def axis(twin=False):
    stages=[]
    stages.append(dict(code="COMP",name="Component verification",sections=[
      dict(name="Head stock assembly",params=[q("13T helical gear",2),q("Spur gears 20T, 48T, 42T, 70T (each)",1),q("Taper roller bearing 30206",3),q("Taper roller bearing 30207",3),q("Taper roller bearing 30216",1)]),
      dict(name="Indexing assembly",params=[q("Spur gear 48T",1),q("Spur gear 21T with centre lead screw rod",1),q("Spur gear 54T (jockey)",1)]),
      dict(name="Main drive gear box",params=[q("Gear box W75 / SW75 / TW75",1),sel("Make",GBMAKE),ex("Ratio","15:1"),txt("Serial no."),ex("Mount","90 B5")]),
      dict(name="Main drive motor",params=[q("Motor 2 HP, 1440 RPM, flange mounting",1),sel("Make",MOTMAKE),txt("Serial no.",evidence=True,hint="Photo of nameplate"),
           ex("Speed",1440,"RPM"),txt("Voltage"),ex("Power",2,"HP"),txt("Insulation class"),txt("Rated current (A)"),sel("Efficiency grade",["IE2","IE3"]),
           dict(label="No-load current",type="range",min=0,max=80,unit="% of rated",mandatory=True,critical=True,criteria="Consumed amps ≤ 80% of rated")]),
      dict(name="Saddle and cross slide",params=[q("Linear slide on the bed",2),txt("Bed slide make"),q("LM block (bed)",1),q("Linear slide on the saddle",2),txt("Saddle slide make"),
           q("LM block (saddle)",8 if twin else 4),q("AC synchronous motor",2 if twin else 1),ex("Synchronous motor make","Srijan Controls Ltd"),ex("Synchronous motor torque",60,"kgf·cm"),
           ex("Synchronous motor speed",60,"RPM"),txt("Synchronous motor serial no."),ex("Synchronous motor voltage",240,"V"),ex("Synchronous motor model","SYN1103")]),
      dict(name="Milling cutter drive assembly",params=[q("Spindle bearing 32206",4 if twin else 2)]+cutter_drive(2 if twin else 1)),
      dict(name="Chuck",params=[ex("Make","Shasons"),ex("Size",10,"in"),ex("Jaws",4,"nos")]),
    ]))
    stages.append(dict(code="ASSY",name="Assembly checks",sections=[dict(name="Assembly checking parameters",params=[
      pf("Gear matching assembly","No projection"),pf("Lead screw rod assembly","Backlash nut with spring fitted"),pf("Gear box and motor assembly","Horizontal fitting"),
      pf("Head stock — oil leakage","No oil leakage",critical=True),pf("Head stock — dowel pins","Dowel pins fitted"),pf("Head stock — bolts","HT bolts used"),
      pf("Saddle cross slide assembly","Free manual movement"),pf("Three roller support assembly","Bearings fitted to correct tightness, rotate freely"),
      pf("Control panel phase indicator","Phase indicator and contactor function"),pf("Indexing assembly","Chuck done with 2 pins — 100, 80, 70, 60, 50"),
      pf("Quality of milling","No vibration",critical=True,evidence=True,hint="Photo/video of trial cut"),pf("Cross slide screw rod and nut","Lubrication provision present")])]))
    stages.append(dict(code="ALGN",name="Alignment",sections=[dict(name="Head stock alignment",params=[
      rng("Head stock — horizontal",0,0.05,"mm",critical=True),rng("Head stock — vertical",0,0.05,"mm",critical=True),
      rng("Head stock to three roller support — horizontal",0,0.05,"mm",critical=True),rng("Head stock to three roller support — vertical",0,0.05,"mm",critical=True),
      rng("Three roller supports — tail end",0,0.05,"mm",critical=True,tbc=True)])]))
    T=[("Top plate — run out / face out",0,0.05,"mm"),("Guide plate — run out / face out",0,0.05,"mm"),("Index plate — run out / face out",0,0.05,"mm"),
       ("Lead screw rod — bend",0,0.40,"mm"),("Main drive gear box — temperature",35,50,"°C"),
       ("Taper, three roller support to head stock (H & V)",0,0.05,"mm"),("Worm wheel shaft — run out",0,0.03,"mm"),("Main lead screw rod with nut — axial play",0,0.10,"mm"),
       ("Cross slide screw rod with nut — axial play",0,0.10,"mm"),("Cutter drive shaft — run out",0,0.03,"mm"),("Cutter gear box — no-load temperature",0,35,"°C"),
       ("Cutter drive housing to gear box — clearance",0,0.05,"mm"),("Worm shaft and wheel assembly — run out",0,0.05,"mm")]
    tol=[rng(*t,critical=True) for t in T]
    tol.append(pf("Linear guide and bearing block — fitment","No shake",critical=True))
    tol.append(rng("Index arm mounting bracket — position and weld",89.5,90.5,"deg",critical=True))
    tol+= [rng("Top shaft — axial play",0,0.10,"mm",critical=True),rng("Bottom shaft — axial play",0,0.10,"mm",critical=True),
           rng("Worm wheel and worm shaft — centre distance",101.50,101.85,"mm",critical=True,tbc=True),rng("Main spindle — run out",0,0.03,"mm",critical=True),
           rng("Head stock holes — centre distance deviation",-0.20,0.20,"mm",critical=True),rng("Plunger pin — ovality",0,0.02,"mm",critical=True),
           rng("Linear slide on the bed — alignment",0,0.03,"mm",critical=True),rng("Synchronous motor — winding resistance",185,205,"Ω",critical=True,tbc=True),
           rng("Chuck — run out and face out",0,0.04,"mm",critical=True),rng("Coolant pump — temperature",0,50,"°C")]
    stages.append(dict(code="TOL",name="Tolerance inspection",sections=[dict(name="Tolerance details",params=tol)]))
    stages.append(dict(code="ELEC",name="Control panel and electrical",sections=[
      dict(name="Inside control panel",params=[rng("Contactor rating",9,12,"A"),yn("SMPS provided"),rng("MPCB rating",1.6,2.64,"A"),yn("AC variator manual provided"),
           yn("Laminated wiring diagram and manual book"),yn("Warning note pasted"),yn("Indicator bulbs functioning"),yn("Counter functioning"),
           yn("Power failure and restart tested",critical=True,evidence=True,hint="Video of restart test"),txt("Panel board make"),txt("Panel board serial no."),txt("Drawing no."),txt("Month / year")]),
      dict(name="Milling machine electrical testing",params=[pf("MPCB 1.4–2.3 A — rating test"),pf("MPCB 0.3–0.6 A — rating test"),pf("AC drive 2 HP"),pf("2 C/O relay 24 V DC (6 nos)"),
           pf("12 A contactor (5 nos)"),pf("415 V incoming"),pf("24 V AC transformer — incoming"),pf("13 R/F — outgoing"),pf("Transformer 415/230/24 V AC, 100+50+150 VA — rating test"),
           pf("Ø18 mm NPN sensor"),pf("MCB 20 A 4P — incoming"),pf("MCB 10 A 3P — 2 HP AC drive incoming"),pf("MCB 6 A 2P — 240 V AC incoming"),pf("MCB 6 A 2P — 24 V AC incoming")])]))
    stages.append(dict(code="FIN",name="Safety, finish and coolant",sections=[
      dict(name="Safety guards",params=[pf("Head stock gear drive guard (1 no)",critical=True),pf("Quality of chip tray (1 no)")]),
      dict(name="Finish",params=[pf("General finish"),pf("Painting")]),
      dict(name="Coolant pump",params=[txt("Machine no."),ex("Power",0.1,"kW"),ex("Voltage",230,"V"),ex("Speed",2800,"RPM"),ex("Make","Stark"),yn("Coolant pump runs on saddle forward movement")])]))
    tools=[("Foundation bolt M12 × 300",8),("Collar Ø55",1),("Hardened sleeve Ø65",1),("Chuck key",2),("Plunger pin",1),("Tool kit",1),("Small pipe hose",1),("Clamp (small hose)",2),
           ("Big pipe hose",1),("Clamp (big hose)",1),("Handle and lever",1),("Chuck shoe",2),("SS tray",1),("MS tray",1)]
    kit=["Double end spanner 10×11","Double end spanner 12×13","Double end spanner 17×19","Double end spanner 24×26","Double end spanner 32×36","Ring spanner 17×19","Ring spanner 24×26",
         "Allen key 4 mm","Allen key 5 mm","Allen key 6 mm","Allen key 8 mm","Allen key 10 mm","Lever type grease can","Oil can","Bearing NJ 205","Coolant hose","On/off valve","Coolant hose holder","Star knob"]
    stages.append(dict(code="TOOLS",name="Tools and accessories",sections=[
      dict(name="Tools list",params=[q(a,b) for a,b in tools]),
      dict(name="Tool kit contents",params=[yn(k) for k in kit]),
      dict(name="Optional items",params=[q("Collar Ø60",1,mandatory=False),q("Collar Ø70",1,mandatory=False)])]))
    # ids
    for st in stages:
        n=0
        for sec in st["sections"]:
            for p in sec["params"]:
                n+=1; p["id"]=f'{st["code"]}-{n:03d}'
                p.setdefault("critical",False); p.setdefault("evidence",False)
    return stages

T=[dict(code="AXIS-MM",name="AXIS Automatic Milling Machine",family="AXIS",revision="B",status="published",effective="2026-08-01",
        header_fields=["Customer","Sales order","Work order","Machine serial no.","Machine type","Despatch date"],
        machine_types=["Automatic","Manual","Standard","Extended"],stages=axis(False)),
   dict(code="AXIS-TMH",name="AXIS Twin Milling Head Milling Machine",family="AXIS",revision="A",status="published",effective="2026-08-01",
        header_fields=["Customer","Sales order","Work order","Machine serial no.","Machine type","Despatch date"],
        machine_types=["Automatic","Manual","Standard","Extended"],stages=axis(True))]
json.dump(dict(source="Axis_Final.xls (Sheet1, Sheet6, Sheet2, Sheet3, Sheet4, Sheet5)",templates=T),open("packet/seed/axis_templates.json","w"),indent=1,ensure_ascii=False)
for t in T: print(t["code"],sum(len(s["params"]) for st in t["stages"] for s in st["sections"]))
