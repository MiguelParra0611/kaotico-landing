import os, subprocess, json
from PIL import Image
# Reconstruye atlas-hi/lo y fondo a partir de los clips. Ejecutar desde
# cualquier sitio: las rutas se deducen de la ubicacion del script.
PROJ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SP   = os.path.join(PROJ, "framer", "_tmp")
os.makedirs(SP, exist_ok=True)
OUT=os.path.join(PROJ,"framer")
CROP_W, CROP_X = 720, 312          # recorte cuadrado dentro del cuadro 1280x720
COLS, N = 13, 20                   # 13 columnas, 20 poses por radio (por defecto)
# Radios con recorrido mas largo necesitan mas celdas o el arranque salta.
N_POR_RADIO = {"S": 26}            # S recorre 3-132; los demas mucho menos
SPOKES=[("E",0,"HORIZONTAL.mp4",3,101),
        ("NE",-45,"TURNUPRIGHT.mp4",6,156),
        ("N",-90,"Puppy_looking_in_four_directions_202608261039.mp4",6,34),
        ("NW",-135,"TURNUPLEFT.mp4",5,105),
        ("W",180,"TURNLEFT.mp4",6,112),
        ("SW",135,"TURNDOWNLEFT.mp4",3,168),
        ("S",90,"TURNDOWN.mp4",3,132),      # hasta 132: las orejas se doblan a partir del 96        # sustituye a VERTICAL.mp4: aquel bajaba parpados, no cabeza
        ("SE",45,"TURNDOWNRIGHT.mp4",2,120)]   # el radio que faltaba

def extraer(cell):
    work=os.path.join(SP,"fr%d"%cell); os.makedirs(work,exist_ok=True)
    for f in os.listdir(work): os.remove(os.path.join(work,f))
    def ex(src,frames,tag):
        expr="+".join(r"eq(n\,%d)"%f for f in frames)
        subprocess.run(["ffmpeg","-v","error","-y","-i",os.path.join(PROJ,src),
            "-vf","select='%s',crop=%d:%d:%d:0,scale=%d:%d"%(expr,CROP_W,CROP_W,CROP_X,cell,cell),
            "-fps_mode","passthrough",os.path.join(work,tag+"_%03d.png")],check=True)
        return [os.path.join(work,f) for f in sorted(os.listdir(work)) if f.startswith(tag+"_")]
    cells=ex("HORIZONTAL.mp4",[0],"c"); spokes=[]
    for nom,ang,src,ini,last in SPOKES:
        n = N_POR_RADIO.get(nom, N)
        fr=sorted(set(round(ini+(last-ini)*k/(n-1)) for k in range(n)))
        start=len(cells); cells+=ex(src,fr,nom)
        spokes.append({"nom":nom,"ang":ang,"band":[start,len(cells)-start]})
    return cells, spokes

def montar(cells, cell, nombre, q):
    rows=(len(cells)+COLS-1)//COLS
    at=Image.new("RGB",(COLS*cell,rows*cell))
    for i,f in enumerate(cells): at.paste(Image.open(f),((i%COLS)*cell,(i//COLS)*cell))
    p=os.path.join(OUT,nombre); at.save(p,"WEBP",quality=q,method=6)
    return rows, at.size, os.path.getsize(p)//1024

hi,sp = extraer(448); rows,dim,kb = montar(hi,448,"atlas-hi.webp",84)
print("atlas-hi : %d celdas  %dx%d  %d KB"%(len(hi),dim[0],dim[1],kb))
lo,_  = extraer(160); _,dim2,kb2 = montar(lo,160,"atlas-lo.webp",80)
print("atlas-lo : %d celdas  %dx%d  %d KB"%(len(lo),dim2[0],dim2[1],kb2))

# fondo estatico 16:9, del frame base
bgp=os.path.join(OUT,"fondo.webp")
subprocess.run(["ffmpeg","-v","error","-y","-i",os.path.join(PROJ,"HORIZONTAL.mp4"),
    "-vf",r"select=eq(n\,0)","-frames:v","1","-quality","88",bgp],check=True)
print("fondo    : 1280x720  %d KB"%(os.path.getsize(bgp)//1024))

meta={"cols":COLS,"rows":rows,"count":len(hi),"center":0,"spokes":sp,
      "cropFrac":{"x":CROP_X/1280,"w":CROP_W/1280},"cellHi":448,"cellLo":160}
open(os.path.join(OUT,"atlas.json"),"w").write(json.dumps(meta,indent=2))
print("\n"+json.dumps(meta["spokes"]))
print("recorte: x %.5f  ancho %.5f  (del cuadro 16:9)"%(CROP_X/1280,CROP_W/1280))
