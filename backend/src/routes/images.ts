import { Router } from 'express';
import multer from 'multer';
import { config } from '../config';
import type { Db } from '../db';
import { ApiError } from '../lib/http';
import { requireAdmin } from '../middleware/requireAdmin';
import { getCatalog, invalidateCatalog, requireDevice } from '../services/catalog';
import { addDeviceImage, deleteDeviceImage, setBrandLogo, setCoverImage } from '../services/images';

const MAX_FILES_PER_UPLOAD = 10;

type ImageParams = { slug: string; imageId: string };

// Keep uploads in memory so they can be checked before anything is written to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxImageBytes, files: MAX_FILES_PER_UPLOAD },
});

/** Console photos and brand logos. All routes need the x-admin-key header. */
export function imageRoutes(db: Db) {
  const router = Router();
  const deviceIdFor = (slug: string) => requireDevice(getCatalog(db), slug).card.id;

  // Body: multipart/form-data with one or more files in the "image" field.
  // ?cover=true makes the first uploaded file the cover photo.
  router.post<{ slug: string }>(
    '/devices/:slug/images',
    requireAdmin,
    upload.array('image', MAX_FILES_PER_UPLOAD),
    (req, res) => {
      const deviceId = deviceIdFor(req.params.slug);
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0)
        throw new ApiError('bad_request', 'Attach at least one file in the "image" field');

      const makeFirstTheCover = req.query.cover === 'true';
      const saved = files.map((file, i) =>
        addDeviceImage(db, deviceId, file.buffer, makeFirstTheCover && i === 0),
      );
      invalidateCatalog();
      res.status(201).json(saved);
    },
  );

  router.post<ImageParams>('/devices/:slug/images/:imageId/cover', requireAdmin, (req, res) => {
    setCoverImage(db, deviceIdFor(req.params.slug), req.params.imageId);
    invalidateCatalog();
    res.status(204).end();
  });

  router.delete<ImageParams>('/devices/:slug/images/:imageId', requireAdmin, (req, res) => {
    deleteDeviceImage(db, deviceIdFor(req.params.slug), req.params.imageId);
    invalidateCatalog();
    res.status(204).end();
  });

  // Body: multipart/form-data with the logo file in the "image" field. Replaces the brand's current logo.
  router.put<{ brand: string }>('/brands/:brand/logo', requireAdmin, upload.single('image'), (req, res) => {
    const brand = req.params.brand;
    const brandExists = getCatalog(db).devices.some(
      (d) => d.card.brand.toLowerCase() === brand.toLowerCase(),
    );
    if (!brandExists) throw new ApiError('not_found', `No console has the brand "${brand}"`);
    if (!req.file) throw new ApiError('bad_request', 'Attach the logo file in the "image" field');

    const saved = setBrandLogo(db, brand, req.file.buffer);
    invalidateCatalog();
    res.json(saved);
  });

  return router;
}
