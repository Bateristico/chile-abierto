import { bcch } from "./bcch";
import { camara } from "./camara";
import { congreso } from "./congreso";
import { dipresIfp } from "./dipres-ifp";
import { fichas } from "./fichas";
import { leyes } from "./leyes";
import { mercadoPublico } from "./mercadopublico";
import type { Connector } from "./types";

export const CONNECTORS: Connector[] = [dipresIfp, camara, congreso, leyes, fichas, bcch, mercadoPublico];
