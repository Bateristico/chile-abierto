import { bcch } from "./bcch";
import { camara } from "./camara";
import { congreso } from "./congreso";
import { dipresIfp } from "./dipres-ifp";
import { fichas } from "./fichas";
import { mercadoPublico } from "./mercadopublico";
import type { Connector } from "./types";

export const CONNECTORS: Connector[] = [dipresIfp, camara, congreso, fichas, bcch, mercadoPublico];
