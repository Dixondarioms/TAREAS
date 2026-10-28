import { registerDecorator, ValidationOptions } from 'class-validator';
import { esDecimalValido } from './dinero';
import { validarRif } from './rif';

interface OpcionesDecimal {
  min?: string;
  max?: string;
  decimales?: number;
}

/** Valida que el campo sea una cadena decimal ("12.50"), opcionalmente con rango y decimales máximos. */
export function EsDecimal(opciones: OpcionesDecimal = {}, validationOptions?: ValidationOptions) {
  return (objeto: object, propiedad: string) =>
    registerDecorator({
      name: 'esDecimal',
      target: objeto.constructor,
      propertyName: propiedad,
      options: {
        message: `${propiedad} debe ser un número decimal válido${
          opciones.min !== undefined ? ` mayor o igual a ${opciones.min}` : ''
        }${opciones.decimales !== undefined ? ` con máximo ${opciones.decimales} decimales` : ''}`,
        ...validationOptions,
      },
      validator: {
        validate(valor: unknown) {
          if (typeof valor !== 'string' || !/^-?\d+(\.\d+)?$/.test(valor.trim())) return false;
          if (!esDecimalValido(valor)) return false;
          const n = Number(valor);
          if (opciones.min !== undefined && n < Number(opciones.min)) return false;
          if (opciones.max !== undefined && n > Number(opciones.max)) return false;
          const partes = valor.split('.');
          if (opciones.decimales !== undefined && (partes[1]?.length ?? 0) > opciones.decimales) return false;
          return true;
        },
      },
    });
}

export function EsRif(validationOptions?: ValidationOptions) {
  return (objeto: object, propiedad: string) =>
    registerDecorator({
      name: 'esRif',
      target: objeto.constructor,
      propertyName: propiedad,
      options: { message: 'RIF o cédula inválido (ej. J-12345678-9 o V-12345678)', ...validationOptions },
      validator: {
        validate: (valor: unknown) => typeof valor === 'string' && validarRif(valor).valido,
      },
    });
}
