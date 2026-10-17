import { bcch } from "./bcch";
import { camara } from "./camara";
import { dipresIfp } from "./dipres-ifp";
import { mercadoPublico } from "./mercadopublico";
import type { Connector } from "./types";

export const CONNECTORS: Connector[] = [dipresIfp, camara, bcch, mercadoPublico];
